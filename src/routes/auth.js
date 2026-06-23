const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const db = require('../config/firebase');
const { sendVerificationEmail, isMock: isEmailMock } = require('../config/email');
const { isGuest, isAuthenticated } = require('../middlewares/auth');
const { authenticator } = require('otplib');

// GET Login page (Only accessible for guests)
router.get('/login', isGuest, (req, res) => {
  res.render('login', { 
    title: 'Đăng nhập - EZ Studio', 
    error: req.query.error || null,
    success: req.query.success || null
  });
});

// POST Login handle
router.post('/login', isGuest, async (req, res) => {
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.render('login', { 
      title: 'Đăng nhập - EZ Studio', 
      error: 'Vui lòng điền đầy đủ thông tin đăng nhập!',
      success: null
    });
  }

  try {
    const usersRef = db.collection('users');
    let userDoc = null;

    // 1. Try matching by username
    let snapshot = await usersRef.where('username', '==', username.trim()).get();
    
    // 2. If not found, try matching by email
    if (snapshot.empty) {
      snapshot = await usersRef.where('email', '==', username.trim().toLowerCase()).get();
    }

    if (snapshot.empty) {
      return res.render('login', { 
        title: 'Đăng nhập - EZ Studio', 
        error: 'Tài khoản hoặc email không tồn tại trong hệ thống!',
        success: null
      });
    }

    userDoc = snapshot.docs[0];
    const userData = userDoc.data();

    // 3. Compare hashed password using bcrypt
    const match = await bcrypt.compare(password, userData.password);
    if (!match) {
      return res.render('login', { 
        title: 'Đăng nhập - EZ Studio', 
        error: 'Mật khẩu đăng nhập không chính xác!',
        success: null
      });
    }

    if (userData.isTwoFactorEnabled) {
      // Prompt for 2FA token
      req.session.pending2FA = {
        id: userDoc.id,
        username: userData.username,
        email: userData.email,
        role: userData.role || 'user',
        balance: userData.balance || 0
      };
      return res.redirect('/login/2fa');
    }

    // 4. Save user info to Session
    req.session.user = {
      id: userDoc.id,
      username: userData.username,
      email: userData.email,
      role: userData.role || 'user',
      balance: userData.balance || 0,
      isTwoFactorEnabled: false
    };

    console.log(`✔ User '${userData.username}' logged in successfully. Role: ${userData.role}`);
    
    if (userData.role === 'admin') {
      res.redirect('/admin');
    } else {
      res.redirect('/');
    }

  } catch (error) {
    console.error('❌ Login database error:', error);
    res.render('login', { 
      title: 'Đăng nhập - EZ Studio', 
      error: `Hệ thống gặp lỗi: ${error.message}`,
      success: null
    });
  }
});

// GET Register page (Only accessible for guests)
router.get('/register', isGuest, (req, res) => {
  res.render('register', { title: 'Đăng ký tài khoản - EZ Studio', error: null, success: false });
});

// POST Register handle (Initiates OTP flow)
router.post('/register', isGuest, async (req, res) => {
  const { username, email, password, confirmPassword } = req.body;

  if (!username || !email || !password || !confirmPassword) {
    return res.render('register', {
      title: 'Đăng ký tài khoản - EZ Studio',
      error: 'Vui lòng điền đầy đủ tất cả các trường thông tin!',
      success: false
    });
  }

  if (password !== confirmPassword) {
    return res.render('register', {
      title: 'Đăng ký tài khoản - EZ Studio',
      error: 'Mật khẩu xác nhận không trùng khớp!',
      success: false
    });
  }

  try {
    const usersRef = db.collection('users');
    const normalizedUsername = username.trim();
    const normalizedEmail = email.trim().toLowerCase();

    // 1. Check if username already exists
    const usernameCheck = await usersRef.where('username', '==', normalizedUsername).get();
    if (!usernameCheck.empty) {
      return res.render('register', {
        title: 'Đăng ký tài khoản - EZ Studio',
        error: 'Tên đăng nhập đã được sử dụng! Vui lòng chọn tên khác.',
        success: false
      });
    }

    // 2. Check if email already exists
    const emailCheck = await usersRef.where('email', '==', normalizedEmail).get();
    if (!emailCheck.empty) {
      return res.render('register', {
        title: 'Đăng ký tài khoản - EZ Studio',
        error: 'Địa chỉ Email đã được đăng ký! Vui lòng dùng email khác.',
        success: false
      });
    }

    // 3. Generate 6-digit OTP code
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();

    // 4. Save registration details temporarily to session
    req.session.tempUser = {
      username: normalizedUsername,
      email: normalizedEmail,
      password: password, // Store plain password temporarily; will hash upon OTP verification
      code: otpCode,
      expiresAt: Date.now() + 5 * 60 * 1000 // 5 Minutes expiration
    };

    // 5. Send OTP Email
    await sendVerificationEmail(normalizedEmail, otpCode);

    // 6. Redirect to OTP verification page
    res.redirect('/verify-email');

  } catch (error) {
    console.error('❌ Register OTP generation error:', error);
    res.render('register', {
      title: 'Đăng ký tài khoản - EZ Studio',
      error: `Gửi mã OTP thất bại: ${error.message}`,
      success: false
    });
  }
});

// GET OTP Verification page (Only accessible if a temporary registration session exists)
router.get('/verify-email', isGuest, (req, res) => {
  if (!req.session.tempUser) {
    return res.redirect('/register');
  }

  // Mask the email for safety (e.g., cu***@domain.com)
  const email = req.session.tempUser.email;
  const parts = email.split('@');
  const maskedEmail = parts[0].slice(0, 3) + '***@' + parts[1];

  res.render('verify-email', {
    title: 'Xác minh email - EZ Studio',
    email: maskedEmail,
    error: req.query.error || null,
    success: req.query.success || null,
    isMock: isEmailMock // Pass mock mode state
  });
});

// POST OTP Verification handle
router.post('/verify-email', isGuest, async (req, res) => {
  if (!req.session.tempUser) {
    return res.redirect('/register');
  }

  const { otp } = req.body;
  const tempUser = req.session.tempUser;

  if (!otp) {
    return res.redirect('/verify-email?error=Vui lòng nhập mã OTP xác minh!');
  }

  // 1. Verify OTP code and expiration
  if (otp.trim() !== tempUser.code) {
    return res.redirect('/verify-email?error=Mã xác minh OTP không chính xác!');
  }

  if (Date.now() > tempUser.expiresAt) {
    return res.redirect('/verify-email?error=Mã OTP đã hết hạn! Vui lòng yêu cầu gửi lại.');
  }

  try {
    const usersRef = db.collection('users');

    // 2. Hash the password
    const hashedPassword = await bcrypt.hash(tempUser.password, 10);

    // 3. Assign role
    const userRole = tempUser.username.toLowerCase() === 'admin' ? 'admin' : 'user';

    const newUser = {
      username: tempUser.username,
      email: tempUser.email,
      password: hashedPassword,
      role: userRole,
      balance: 0,
      isTwoFactorEnabled: false,
      createdAt: new Date().toISOString()
    };

    // 4. Save to Firestore
    const userDocRef = await usersRef.add(newUser);

    // 5. Establish official login session
    req.session.user = {
      id: userDocRef.id,
      username: newUser.username,
      email: newUser.email,
      role: newUser.role,
      balance: newUser.balance,
      isTwoFactorEnabled: false
    };

    console.log(`✔ User '${tempUser.username}' verified email and registered. Role: ${userRole}`);

    // 6. Clean up temporary session data
    delete req.session.tempUser;

    if (userRole === 'admin') {
      res.redirect('/admin?success=Đăng ký tài khoản quản trị thành công!');
    } else {
      res.redirect('/?success=Đăng ký tài khoản thành công!');
    }

  } catch (error) {
    console.error('❌ Firestore user registration error after OTP:', error);
    res.redirect(`/verify-email?error=Đăng ký tài khoản thất bại: ${error.message}`);
  }
});

// POST Resend OTP handle
router.post('/verify-email/resend', isGuest, async (req, res) => {
  if (!req.session.tempUser) {
    return res.redirect('/register');
  }

  const tempUser = req.session.tempUser;

  try {
    // Generate new OTP code
    const newOtpCode = Math.floor(100000 + Math.random() * 900000).toString();

    // Update tempUser session
    tempUser.code = newOtpCode;
    tempUser.expiresAt = Date.now() + 5 * 60 * 1000;

    // Resend Email
    await sendVerificationEmail(tempUser.email, newOtpCode);

    res.redirect('/verify-email?success=Mã xác minh mới đã được gửi đến email của bạn!');
  } catch (error) {
    console.error('❌ Resend OTP error:', error);
    res.redirect(`/verify-email?error=Không thể gửi lại mã: ${error.message}`);
  }
});

// GET Logout handle (Must be authenticated to logout)
router.get('/logout', isAuthenticated, (req, res) => {
  const username = req.session.user ? req.session.user.username : 'Unknown';
  req.session.destroy((err) => {
    if (err) {
      console.error('❌ Failed to destroy session on logout:', err);
      return res.redirect('/');
    }
    console.log(`✔ User '${username}' logged out.`);
    res.clearCookie('connect.sid'); // Clear session cookie
    res.redirect('/login?success=Đăng xuất tài khoản thành công!');
  });
});

// GET Forgot Password page
router.get('/forgot-password', isGuest, (req, res) => {
  res.render('forgot-password', { title: 'Quên mật khẩu - EZ Studio', success: false });
});

// POST Forgot Password handle
router.post('/forgot-password', isGuest, async (req, res) => {
  const { email } = req.body;
  
  if (!email) {
    return res.render('forgot-password', { 
      title: 'Quên mật khẩu - EZ Studio', 
      success: 'Vui lòng nhập địa chỉ email!' 
    });
  }

  try {
    const usersRef = db.collection('users');
    const emailCheck = await usersRef.where('email', '==', email.trim().toLowerCase()).get();
    
    if (emailCheck.empty) {
      return res.render('forgot-password', {
        title: 'Quên mật khẩu - EZ Studio',
        success: 'Không tìm thấy tài khoản nào liên kết với email này.'
      });
    }

    res.render('forgot-password', {
      title: 'Quên mật khẩu - EZ Studio',
      success: `Một liên kết khôi phục mật khẩu giả lập đã được gửi đến email ${email}!`
    });
  } catch (error) {
    console.error('❌ Forgot password database error:', error);
    res.render('forgot-password', {
      title: 'Quên mật khẩu - EZ Studio',
      success: 'Hệ thống gặp sự cố khi xử lý yêu cầu.'
    });
  }
});

// GET 2FA Verification page
router.get('/login/2fa', isGuest, (req, res) => {
  if (!req.session.pending2FA) {
    return res.redirect('/login');
  }
  res.render('login-2fa', {
    title: 'Xác minh 2 bước - EZ Studio',
    error: req.query.error || null
  });
});

// POST 2FA Verification handle
router.post('/login/2fa', isGuest, async (req, res) => {
  if (!req.session.pending2FA) {
    return res.redirect('/login');
  }

  const { token } = req.body;
  const pendingUser = req.session.pending2FA;

  if (!token) {
    return res.redirect('/login/2fa?error=Vui lòng nhập mã xác minh!');
  }

  try {
    const userDoc = await db.collection('users').doc(pendingUser.id).get();
    if (!userDoc.exists) {
      return res.redirect('/login?error=Tài khoản không tồn tại!');
    }

    const userData = userDoc.data();
    
    // Verify token
    const isValid = authenticator.verify({ token, secret: userData.twoFactorSecret });
    
    if (!isValid) {
      return res.redirect('/login/2fa?error=Mã xác minh không chính xác!');
    }

    // Login success
    req.session.user = {
      id: pendingUser.id,
      username: pendingUser.username,
      email: pendingUser.email,
      role: pendingUser.role,
      balance: pendingUser.balance,
      isTwoFactorEnabled: true
    };

    delete req.session.pending2FA;
    console.log(`✔ User '${pendingUser.username}' passed 2FA and logged in.`);

    if (pendingUser.role === 'admin') {
      res.redirect('/admin');
    } else {
      res.redirect('/');
    }

  } catch (error) {
    console.error('❌ 2FA verification error:', error);
    res.redirect(`/login/2fa?error=Hệ thống gặp sự cố: ${error.message}`);
  }
});

module.exports = router;
