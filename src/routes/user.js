const express = require('express');
const router = express.Router();
const db = require('../config/firebase');
const { isAuthenticated } = require('../middlewares/auth');
const { authenticator } = require('otplib');
const qrcode = require('qrcode');

// Apply authentication middleware to all user routes
router.use(isAuthenticated);

// GET User Dashboard (Wallet & Overview)
router.get('/dashboard', async (req, res) => {
  try {
    const userDoc = await db.collection('users').doc(req.session.user.id).get();
    const userData = userDoc.data();
    
    // Refresh session balance
    req.session.user.balance = userData.balance || 0;

    res.render('user/dashboard', {
      title: 'Bảng điều khiển - EZ Studio',
      activePage: 'dashboard',
      balance: req.session.user.balance,
      success: req.query.success,
      error: req.query.error
    });
  } catch (error) {
    res.redirect('/?error=Lỗi tải dữ liệu người dùng');
  }
});

// GET User Settings
router.get('/settings', async (req, res) => {
  try {
    const userDoc = await db.collection('users').doc(req.session.user.id).get();
    const userData = userDoc.data();

    res.render('user/settings', {
      title: 'Cài đặt tài khoản - EZ Studio',
      activePage: 'settings',
      user: userData,
      qrCodeUrl: req.session.tempQR || null,
      tempSecret: req.session.tempSecret || null,
      success: req.query.success,
      error: req.query.error
    });
    
    // Clear temp QR after rendering
    if (req.session.tempQR) {
      delete req.session.tempQR;
      delete req.session.tempSecret;
    }
  } catch (error) {
    res.redirect('/user/dashboard?error=Lỗi tải cài đặt');
  }
});

// POST Enable 2FA - Generate QR
router.post('/settings/2fa/generate', async (req, res) => {
  try {
    const secret = authenticator.generateSecret();
    const otpauth = authenticator.keyuri(req.session.user.email, 'EZ Studio', secret);
    const imageUrl = await qrcode.toDataURL(otpauth);
    
    req.session.tempSecret = secret;
    req.session.tempQR = imageUrl;
    
    res.redirect('/user/settings#security');
  } catch (error) {
    console.error('QR Generate Error:', error);
    res.redirect('/user/settings?error=Không thể tạo mã QR');
  }
});

// POST Verify and Enable 2FA
router.post('/settings/2fa/verify', async (req, res) => {
  const { token, secret } = req.body;
  if (!token || !secret) {
    return res.redirect('/user/settings?error=Thiếu thông tin xác minh');
  }

  const isValid = authenticator.verify({ token, secret });
  if (isValid) {
    try {
      await db.collection('users').doc(req.session.user.id).set({
        isTwoFactorEnabled: true,
        twoFactorSecret: secret
      }, { merge: true });
      
      req.session.user.isTwoFactorEnabled = true;
      res.redirect('/user/settings?success=Bật xác minh 2 bước thành công!');
    } catch (error) {
      res.redirect('/user/settings?error=Lỗi lưu dữ liệu');
    }
  } else {
    res.redirect('/user/settings?error=Mã xác minh không chính xác');
  }
});

// POST Disable 2FA
router.post('/settings/2fa/disable', async (req, res) => {
  try {
    await db.collection('users').doc(req.session.user.id).set({
      isTwoFactorEnabled: false,
      twoFactorSecret: null
    }, { merge: true });
    
    req.session.user.isTwoFactorEnabled = false;
    res.redirect('/user/settings?success=Đã tắt xác minh 2 bước!');
  } catch (error) {
    res.redirect('/user/settings?error=Lỗi khi tắt 2FA');
  }
});

// GET Topup Page
router.get('/topup', async (req, res) => {
  res.render('user/topup', {
    title: 'Nạp tiền vào Ví - EZ Studio',
    activePage: 'topup',
    user: req.session.user
  });
});

// GET History Page
router.get('/history', async (req, res) => {
  try {
    const snapshot = await db.collection('transactions')
      .where('userId', '==', req.session.user.id)
      .get();
      
    const transactions = [];
    snapshot.docs.forEach(doc => {
      transactions.push({ id: doc.id, ...doc.data() });
    });
    
    // Sort descending by date locally (Mock DB limitations workaround)
    transactions.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.render('user/history', {
      title: 'Lịch sử giao dịch - EZ Studio',
      activePage: 'history',
      transactions
    });
  } catch (error) {
    res.redirect('/user/dashboard?error=Lỗi tải lịch sử giao dịch');
  }
});

// POST Card2k Topup Mock
router.post('/topup/card', async (req, res) => {
  const { telco, amount, pin, serial } = req.body;
  
  if (!telco || !amount || !pin || !serial) {
    return res.redirect('/user/topup?error=Thiếu thông tin thẻ cào');
  }

  try {
    // Note: In real production, this sends an API request to Card2k and records a PENDING transaction
    // For this demonstration, we'll mock a successful response after 2 seconds with a 20% fee deduction.
    
    const parsedAmount = parseInt(amount);
    const receivedAmount = parsedAmount * 0.8; // 20% fee

    // Save transaction as PENDING first
    const txRef = await db.collection('transactions').add({
      userId: req.session.user.id,
      type: 'TOPUP',
      amount: receivedAmount, // Expected to receive
      status: 'PENDING',
      description: `Nạp thẻ ${telco} mệnh giá ${parsedAmount}`,
      serial: serial,
      pin: pin,
      createdAt: new Date().toISOString()
    });

    // Simulate async callback (mock webhook)
    setTimeout(async () => {
      try {
        const userDoc = await db.collection('users').doc(req.session.user.id).get();
        const userData = userDoc.data();
        
        // Update user balance
        await db.collection('users').doc(req.session.user.id).set({
          balance: (userData.balance || 0) + receivedAmount
        }, { merge: true });

        // Update TX
        await db.collection('transactions').doc(txRef.id).set({
          status: 'COMPLETED'
        }, { merge: true });
        
        console.log(`Mock Card2k: Thẻ ${serial} nạp thành công, cộng ${receivedAmount}đ`);
      } catch (err) {
        console.log('Mock Card2k error:', err);
      }
    }, 2000);

    res.redirect('/user/history?success=Thẻ đang được hệ thống xử lý (PENDING). Vui lòng tải lại trang sau ít phút!');
  } catch (error) {
    res.redirect('/user/topup?error=Lỗi kết nối cổng thẻ cào');
  }
});

// GET Seller Application Page
router.get('/seller/apply', (req, res) => {
  res.render('user/seller-apply', {
    title: 'Đăng ký Seller - EZ Studio',
    user: req.session.user
  });
});

// POST Seller Application
router.post('/seller/apply', async (req, res) => {
  const { bio, portfolio } = req.body;
  if (!bio) {
    return res.redirect('/user/seller/apply?error=Vui lòng điền thông tin giới thiệu');
  }

  try {
    // Add request to audit logs or a specific 'applications' collection
    await db.collection('audit_logs').add({
      type: 'SELLER_APPLICATION',
      userId: req.session.user.id,
      username: req.session.user.username,
      bio,
      portfolio,
      status: 'PENDING',
      createdAt: new Date().toISOString()
    });

    res.redirect('/user/dashboard?success=Yêu cầu của bạn đã được gửi. Quản trị viên sẽ sớm xem xét!');
  } catch (error) {
    res.redirect('/user/seller/apply?error=Lỗi khi gửi yêu cầu');
  }
});

// GET Library (Purchased Items)
router.get('/library', async (req, res) => {
  try {
    const libSnapshot = await db.collection('library')
      .where('userId', '==', req.session.user.id)
      .get();
      
    const library = [];
    libSnapshot.docs.forEach(doc => {
      library.push({ id: doc.id, ...doc.data() });
    });

    res.render('user/library', {
      title: 'Thư viện của tôi - EZ Studio',
      activePage: 'library',
      library,
      user: req.session.user
    });
  } catch (error) {
    res.redirect('/user/dashboard?error=Lỗi tải thư viện');
  }
});

// POST Download Request (Token Generation Mock)
router.post('/download', async (req, res) => {
  const { productId } = req.body;
  
  // Verify ownership
  const libSnapshot = await db.collection('library')
    .where('userId', '==', req.session.user.id)
    .where('productId', '==', productId)
    .get();
    
  if (libSnapshot.empty) {
    return res.redirect('/user/library?error=Bạn chưa mua sản phẩm này');
  }

  // Generate a mock secure token (In reality, interact with Firebase Storage getSignedUrl)
  const token = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  
  // Redirect to a mocked signed URL or direct download route
  res.redirect(`/user/library?success=Đang chuẩn bị file tải xuống... (Token: ${token})`);
});

// POST Refund Request
router.post('/refund', async (req, res) => {
  const { productId } = req.body;
  
  // Verify ownership
  const libSnapshot = await db.collection('library')
    .where('userId', '==', req.session.user.id)
    .where('productId', '==', productId)
    .get();
    
  if (libSnapshot.empty) {
    return res.redirect('/user/library?error=Sản phẩm không hợp lệ');
  }

  const libDoc = libSnapshot.docs[0];
  const item = libDoc.data();

  // Create refund ticket
  await db.collection('refunds').add({
    userId: req.session.user.id,
    productId: productId,
    productTitle: item.productTitle,
    status: 'PENDING',
    createdAt: new Date().toISOString()
  });

  res.redirect('/user/library?success=Đã gửi yêu cầu hoàn tiền. Quản trị viên sẽ liên hệ với bạn qua Email.');
});

// GET Lucky Spin Page
router.get('/spin', (req, res) => {
  res.render('user/spin', {
    title: 'Vòng quay may mắn - EZ Studio',
    user: req.session.user,
    spinResult: req.session.spinResult || null
  });
  
  // Clear result after showing
  if (req.session.spinResult) {
    delete req.session.spinResult;
  }
});

// POST Lucky Spin Logic
router.post('/spin', async (req, res) => {
  try {
    const userDoc = await db.collection('users').doc(req.session.user.id).get();
    const userData = userDoc.data();
    const currentBalance = userData.balance || 0;
    const spinCost = 10000;

    if (currentBalance < spinCost) {
      return res.redirect('/user/spin?error=Không đủ số dư để quay');
    }

    // Deduct cost
    let newBalance = currentBalance - spinCost;

    // Define Prizes
    const prizes = [
      { id: 1, name: 'Jackpot', value: 500000, chance: 0.01 }, // 1%
      { id: 2, name: 'Giải Nhất', value: 100000, chance: 0.05 }, // 5%
      { id: 3, name: 'Giải Nhì', value: 50000, chance: 0.10 }, // 10%
      { id: 4, name: 'Hoàn Tiền', value: 10000, chance: 0.20 }, // 20%
      { id: 5, name: 'Chúc bạn may mắn lần sau', value: 0, chance: 0.64 } // 64%
    ];

    // Determine result
    const rand = Math.random();
    let cumulative = 0;
    let wonPrize = prizes[4];

    for (let prize of prizes) {
      cumulative += prize.chance;
      if (rand < cumulative) {
        wonPrize = prize;
        break;
      }
    }

    // Apply winnings
    if (wonPrize.value > 0) {
      newBalance += wonPrize.value;
    }

    // Atomic Update DB
    await db.collection('users').doc(req.session.user.id).set({
      balance: newBalance
    }, { merge: true });

    req.session.user.balance = newBalance;

    // Record transactions
    await db.collection('transactions').add({
      userId: req.session.user.id,
      type: 'GAMING',
      amount: -spinCost,
      status: 'COMPLETED',
      description: `Chơi Vòng Quay May Mắn`,
      createdAt: new Date().toISOString()
    });

    if (wonPrize.value > 0) {
      await db.collection('transactions').add({
        userId: req.session.user.id,
        type: 'GAMING_REWARD',
        amount: wonPrize.value,
        status: 'COMPLETED',
        description: `Trúng thưởng: ${wonPrize.name}`,
        createdAt: new Date().toISOString()
      });
    }

    req.session.spinResult = {
      title: wonPrize.value > 0 ? 'Chúc mừng!' : 'Rất tiếc!',
      message: wonPrize.value > 0 ? `Bạn đã trúng ${wonPrize.name} (${new Intl.NumberFormat('vi-VN').format(wonPrize.value)} VND)` : 'Chúc bạn may mắn lần sau nhé!',
      isWin: wonPrize.value > 0
    };

    res.redirect('/user/spin');
  } catch (error) {
    res.redirect('/user/spin?error=Lỗi hệ thống khi quay');
  }
});

module.exports = router;
