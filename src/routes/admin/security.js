/**
 * Admin Security Panel Routes
 * Audit logs (read-only), download abuse monitoring, auto-unban management, TOTP setup.
 */
const express = require('express');
const router = express.Router();
const db = require('../../config/firebase');
const { requireAdminOtp } = require('../../middlewares/auth');
const { logAdminAction } = require('../../middlewares/audit-logger');
const { generateSecret, generateQRCodeDataUrl, verifyToken } = require('../../services/totp-service');
const { sendEmail } = require('../../config/email');

// GET /admin/security — Security panel main view (3 tabs)
router.get('/', async (req, res) => {
  try {
    const [auditSnap, abuseSnap, usersSnap] = await Promise.all([
      db.collection('audit_logs').orderBy('timestamp', 'desc').get(),
      db.collection('download_abuse_flags').get(),
      db.collection('users').get(),
    ]);

    const auditLogs = auditSnap.docs.slice(0, 50).map(d => ({ id: d.id, ...d.data() }));
    const abuseFlags = abuseSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    // Auto-unban list: users with autoUnbanAt in the future
    const now = new Date();
    const bannedUsers = usersSnap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(u => u.bannedAt && u.autoUnbanAt && new Date(u.autoUnbanAt) > now);

    res.render('admin/security', {
      title: 'Bảo mật & Giám sát - EZ Studio',
      activePage: 'security',
      auditLogs,
      abuseFlags,
      bannedUsers,
      activeTab: req.query.tab || 'audit',
      success: req.query.success,
      error: req.query.error,
    });
  } catch (err) {
    res.render('admin/security', {
      title: 'Bảo mật', activePage: 'security',
      auditLogs: [], abuseFlags: [], bannedUsers: [], activeTab: 'audit', error: err.message,
    });
  }
});

// GET /admin/audit-logs — Read-only audit logs (paginated JSON)
router.get('/audit-logs', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 50;
    const snapshot = await db.collection('audit_logs').orderBy('timestamp', 'desc').get();
    const all = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    const total = all.length;
    const logs = all.slice((page - 1) * limit, page * limit);

    res.json({ success: true, logs, total, page, pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /admin/download-abuse — Flagged abuse accounts
router.get('/download-abuse', async (req, res) => {
  try {
    const snapshot = await db.collection('download_abuse_flags').get();
    const flags = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    res.json({ success: true, flags });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /admin/download-abuse/:id/warn — Send warning email to flagged user
router.post('/download-abuse/:id/warn', async (req, res) => {
  try {
    const { id } = req.params;
    const flagDoc = await db.collection('download_abuse_flags').doc(id).get();
    if (!flagDoc.exists) return res.status(404).json({ success: false, error: 'Flag không tìm thấy.' });

    const flagData = flagDoc.data();
    const userDoc = await db.collection('users').doc(flagData.userId).get();
    const userEmail = userDoc.exists ? userDoc.data().email : null;

    if (userEmail) {
      await sendEmail({
        to: userEmail,
        subject: '⚠️ Cảnh báo: Hành vi tải file bất thường',
        html: `<h2>Cảnh báo từ EZ Studio</h2><p>Chúng tôi phát hiện hành vi tải file bất thường trên tài khoản của bạn. Nếu tiếp tục, tài khoản của bạn có thể bị tạm khóa.</p>`,
      }).catch(e => console.warn('[ABUSE] Email warning failed:', e.message));
    }

    await db.collection('download_abuse_flags').doc(id).set(
      { action: 'warned', warnedAt: new Date().toISOString() },
      { merge: true }
    );
    await logAdminAction(req, 'WARN_ABUSE_USER', flagData.userId, 'user', { flagId: id });

    res.json({ success: true, message: 'Đã gửi email cảnh báo.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /admin/download-abuse/:id/ban — Ban flagged user (requires OTP)
router.post('/download-abuse/:id/ban', requireAdminOtp, async (req, res) => {
  try {
    const { id } = req.params;
    const flagDoc = await db.collection('download_abuse_flags').doc(id).get();
    if (!flagDoc.exists) return res.status(404).json({ success: false, error: 'Flag không tìm thấy.' });

    const flagData = flagDoc.data();
    await db.collection('users').doc(flagData.userId).set({
      bannedAt: new Date().toISOString(),
      banReason: `Download abuse — ${req.adminActionReason}`,
      bannedBy: req.session.user.email,
    }, { merge: true });

    await db.collection('download_abuse_flags').doc(id).set(
      { action: 'banned', bannedAt: new Date().toISOString() },
      { merge: true }
    );
    await logAdminAction(req, 'BAN_ABUSE_USER', flagData.userId, 'user', { reason: req.adminActionReason });

    res.json({ success: true, message: 'Đã cấm tài khoản vi phạm.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /admin/auto-unban — List temporarily banned users with remaining time
router.get('/auto-unban', async (req, res) => {
  try {
    const snapshot = await db.collection('users').get();
    const now = new Date();
    const bannedUsers = snapshot.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(u => u.bannedAt && u.autoUnbanAt && new Date(u.autoUnbanAt) > now)
      .map(u => ({
        ...u,
        remainingMs: new Date(u.autoUnbanAt) - now,
      }));

    res.json({ success: true, bannedUsers });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /admin/auto-unban/:id/unban — Manually unban before scheduled time
router.post('/auto-unban/:id/unban', async (req, res) => {
  try {
    const { id } = req.params;
    await db.collection('users').doc(id).set({
      bannedAt: null, banReason: null, bannedBy: null,
      autoUnbanAt: null, unbannedAt: new Date().toISOString(),
      unbannedBy: req.session.user.email,
    }, { merge: true });
    await logAdminAction(req, 'MANUAL_UNBAN', id, 'user', {});
    res.json({ success: true, message: 'Đã mở khóa tài khoản thủ công.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /admin/security/totp-setup — TOTP setup page for admin
router.get('/totp-setup', async (req, res) => {
  try {
    const adminUser = req.session.user;
    let qrDataUrl = null;
    let secret = null;

    // Only generate new secret if admin doesn't have one yet
    if (!adminUser.totpSecret) {
      secret = generateSecret();
      // Store temporarily in session until confirmed
      req.session.pendingTotpSecret = secret;
      qrDataUrl = await generateQRCodeDataUrl(adminUser.email, secret);
    }

    res.render('admin/security/totp-setup', {
      title: 'Thiết lập 2FA - EZ Studio',
      activePage: 'security',
      qrDataUrl,
      secret,
      alreadySetup: !!adminUser.totpSecret,
      error: req.query.error,
      success: req.query.success,
    });
  } catch (err) {
    res.redirect('/admin/overview?error=Lỗi khởi tạo TOTP: ' + err.message);
  }
});

// POST /admin/security/totp-setup — Confirm and save TOTP secret
router.post('/totp-setup', async (req, res) => {
  try {
    const { confirmCode } = req.body;
    const pendingSecret = req.session.pendingTotpSecret;

    if (!pendingSecret) {
      return res.redirect('/admin/security/totp-setup?error=Phiên thiết lập đã hết hạn. Vui lòng thử lại.');
    }

    const isValid = verifyToken(pendingSecret, confirmCode);
    if (!isValid) {
      return res.redirect('/admin/security/totp-setup?error=Mã OTP không đúng. Vui lòng quét lại QR và thử.');
    }

    // Save TOTP secret to Firestore and session
    const adminId = req.session.user.id || req.session.user.uid;
    await db.collection('users').doc(adminId).set({
      totpSecret: pendingSecret,
      totpConfigured: true,
      totpSetupAt: new Date().toISOString(),
    }, { merge: true });

    // Update session
    req.session.user.totpSecret = pendingSecret;
    req.session.user.totpConfigured = true;
    delete req.session.pendingTotpSecret;

    await logAdminAction(req, 'TOTP_SETUP_COMPLETED', adminId, 'user', {});
    res.redirect('/admin/overview?success=Thiết lập 2FA thành công! Tài khoản của bạn đã được bảo vệ.');
  } catch (err) {
    res.redirect('/admin/security/totp-setup?error=' + err.message);
  }
});

module.exports = router;
