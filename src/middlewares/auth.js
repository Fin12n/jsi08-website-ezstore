/**
 * Authentication & Authorization Middlewares
 * Enhanced with TOTP (Option B) confirm flow for sensitive admin actions.
 */
const { verifyToken } = require('../services/totp-service');

// Block authenticated users from guest pages (like login/register)
function isGuest(req, res, next) {
  if (req.session && req.session.user) {
    return res.redirect('/');
  }
  next();
}

// Block unauthenticated users from private pages
function isAuthenticated(req, res, next) {
  if (req.session && req.session.user) {
    return next();
  }
  res.redirect('/login?error=Bạn cần đăng nhập để thực hiện chức năng này!');
}

// Block non-admin users from admin dashboard pages
// Also enforces TOTP setup: if admin hasn't set up TOTP, redirect to setup page
function isAdmin(req, res, next) {
  if (req.session && req.session.user && req.session.user.role === 'admin') {
    // (TOTP Disabled by user request)
    // const setupPaths = ['/admin/security/totp-setup', '/admin/api/totp-setup'];
    // if (setupPaths.some(p => req.originalUrl.startsWith(p))) {
    //   return next();
    // }
    // if (!req.session.user.totpConfigured) {
    //   return res.redirect('/admin/security/totp-setup');
    // }
    return next();
  }
  res.redirect('/login?error=Bạn cần tài khoản quyền Admin để truy cập trang này!');
}

// Block non-seller users from seller dashboard pages
function isSeller(req, res, next) {
  if (req.session && req.session.user && (req.session.user.role === 'seller' || req.session.user.role === 'admin')) {
    return next();
  }
  res.redirect('/login?error=Bạn cần tài khoản quyền Người bán (Seller) để truy cập trang này!');
}

/**
 * Middleware factory for dangerous admin actions that require TOTP confirmation.
 * Usage: router.post('/some/action', requireAdminOtp, handler)
 *
 * Expects in request body:
 *   - otpCode: string (6-digit TOTP code)
 *   - reason: string (mandatory reason for the action)
 *
 * Returns JSON error if OTP invalid, so frontend should handle via fetch/AJAX.
 */
function requireAdminOtp(req, res, next) {
  const { otpCode, reason } = req.body;

  if (!reason || reason.trim().length < 3) {
    return res.status(400).json({ success: false, error: 'Vui lòng nhập lý do hành động (tối thiểu 3 ký tự).' });
  }

  // TOTP Disabled by user request
  // if (!otpCode || otpCode.length !== 6) {
  //   return res.status(400).json({ success: false, error: 'Mã OTP không hợp lệ. Vui lòng nhập đủ 6 số.' });
  // }
  // const adminTotpSecret = req.session.user && req.session.user.totpSecret;
  // if (!adminTotpSecret) {
  //   return res.status(403).json({ success: false, error: 'Tài khoản Admin chưa cấu hình TOTP. Vui lòng thiết lập 2FA trước.' });
  // }
  // const isValid = verifyToken(adminTotpSecret, otpCode);
  // if (!isValid) {
  //   return res.status(401).json({ success: false, error: 'Mã OTP sai hoặc đã hết hạn. Vui lòng thử lại.' });
  // }

  // OTP verified (skipped) — attach reason to req for downstream handlers / audit logger
  req.adminActionReason = reason.trim();
  next();
}

module.exports = {
  isGuest,
  isAuthenticated,
  isAdmin,
  isSeller,
  requireAdminOtp,
};
