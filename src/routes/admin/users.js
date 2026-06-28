/**
 * Admin Users Management Routes
 * Full user management: search, wallet adjust, force logout, ban, role change, delete.
 * Sensitive actions require TOTP confirmation via requireAdminOtp middleware.
 */
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../../config/firebase');
const { requireAdminOtp } = require('../../middlewares/auth');
const { logAdminAction } = require('../../middlewares/audit-logger');
const { creditWallet, debitWallet } = require('../../services/wallet-service');

// GET /admin/users — List users with filter support
router.get('/', async (req, res) => {
  try {
    const { search, role, status } = req.query;
    const snapshot = await db.collection('users').get();
    let usersList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    // Auto-cleanup: Hard delete any previously soft-deleted users in Firestore
    const softDeletedUsers = usersList.filter(u => u.deletedAt);
    if (softDeletedUsers.length > 0) {
      for (const u of softDeletedUsers) {
        await db.collection('users').doc(u.id).delete();
      }
      const newSnapshot = await db.collection('users').get();
      usersList = newSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }

    // Apply filters
    if (search) {
      const q = search.toLowerCase();
      usersList = usersList.filter(u =>
        (u.email && u.email.toLowerCase().includes(q)) ||
        (u.displayName && u.displayName.toLowerCase().includes(q)) ||
        (u.id && u.id.toLowerCase().includes(q))
      );
    }
    if (role && role !== 'all') {
      usersList = usersList.filter(u => u.role === role);
    }
    
    // Filter status
    if (status === 'banned') {
      usersList = usersList.filter(u => u.bannedAt && !u.unbannedAt);
    } else if (status === 'active') {
      usersList = usersList.filter(u => !u.bannedAt || u.unbannedAt);
    }

    res.render('admin/users', {
      title: 'Quản lý Thành viên - EZ Studio',
      activePage: 'users',
      usersList,
      filters: { search, role, status },
      success: req.query.success,
      error: req.query.error,
    });
  } catch (err) {
    res.render('admin/users', { title: 'Người dùng', activePage: 'users', usersList: [], filters: {}, error: err.message });
  }
});

// POST /admin/api/users/:id/wallet — Adjust wallet balance (requires OTP)
router.post('/api/users/:id/wallet', requireAdminOtp, async (req, res) => {
  try {
    const { id } = req.params;
    const { adjustType, amount, reason } = req.body;
    const parsedAmount = parseInt(amount, 10);

    if (!parsedAmount || parsedAmount <= 0) {
      return res.status(400).json({ success: false, error: 'Số tiền không hợp lệ.' });
    }

    const adminInfo = { id: req.session.user.id, email: req.session.user.email };

    let result;
    if (adjustType === 'credit') {
      result = await creditWallet({ userId: id, amount: parsedAmount, reason, adminInfo, req });
    } else if (adjustType === 'debit') {
      result = await debitWallet({ userId: id, amount: parsedAmount, reason, adminInfo, req });
    } else {
      return res.status(400).json({ success: false, error: 'adjustType phải là "credit" hoặc "debit".' });
    }

    res.json({
      success: true,
      message: `Đã ${adjustType === 'credit' ? 'cộng' : 'trừ'} ${parsedAmount.toLocaleString('vi-VN')}đ thành công.`,
      balanceBefore: result.balanceBefore,
      balanceAfter: result.balanceAfter,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /admin/api/users/:id/force-logout — Invalidate user's session (requires OTP)
router.post('/api/users/:id/force-logout', requireAdminOtp, async (req, res) => {
  try {
    const { id } = req.params;
    // Mark user with a forceLogoutAt timestamp — session middleware checks this on each request
    await db.collection('users').doc(id).set(
      { forceLogoutAt: new Date().toISOString() },
      { merge: true }
    );
    await logAdminAction(req, 'FORCE_LOGOUT', id, 'user', { reason: req.adminActionReason });
    res.json({ success: true, message: 'Đã hủy phiên đăng nhập của người dùng.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /admin/api/users/:id/role — Change user role/rank
router.post('/api/users/:id/role', async (req, res) => {
  try {
    const { id } = req.params;
    const { role, rank } = req.body;

    const updates = {};
    if (role) updates.role = role;
    if (rank) updates.rank = rank;

    await db.collection('users').doc(id).set(updates, { merge: true });
    await logAdminAction(req, 'ROLE_CHANGE', id, 'user', { newRole: role, newRank: rank });

    res.json({ success: true, message: `Đã cập nhật vai trò thành công.` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /admin/api/users/:id/ban — Ban a user account (requires OTP)
router.post('/api/users/:id/ban', requireAdminOtp, async (req, res) => {
  try {
    const { id } = req.params;
    const { duration } = req.body; // duration in hours, 0 = permanent

    const banData = {
      bannedAt: new Date().toISOString(),
      banReason: req.adminActionReason,
      bannedBy: req.session.user.email,
    };

    if (duration && parseInt(duration) > 0) {
      const unbanDate = new Date();
      unbanDate.setHours(unbanDate.getHours() + parseInt(duration));
      banData.autoUnbanAt = unbanDate.toISOString();
    }

    await db.collection('users').doc(id).set(banData, { merge: true });
    await logAdminAction(req, 'BAN_USER', id, 'user', {
      reason: req.adminActionReason, duration: duration || 'permanent',
    });

    res.json({ success: true, message: `Đã cấm tài khoản thành công.` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /admin/api/users/:id/unban — Unban a user
router.post('/api/users/:id/unban', requireAdminOtp, async (req, res) => {
  try {
    const { id } = req.params;
    await db.collection('users').doc(id).set({
      bannedAt: null,
      banReason: null,
      bannedBy: null,
      autoUnbanAt: null,
      unbannedAt: new Date().toISOString(),
    }, { merge: true });
    await logAdminAction(req, 'UNBAN_USER', id, 'user', { reason: req.adminActionReason });
    res.json({ success: true, message: 'Đã mở khóa tài khoản.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /admin/api/users/:id/reset-password — Manually reset password
router.post('/api/users/:id/reset-password', async (req, res) => {
  try {
    const { id } = req.params;
    const { newPassword } = req.body;

    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({ success: false, error: 'Mật khẩu mới phải có ít nhất 8 ký tự.' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);
    await db.collection('users').doc(id).set(
      { password: hashedPassword, passwordResetAt: new Date().toISOString() },
      { merge: true }
    );
    await logAdminAction(req, 'RESET_PASSWORD', id, 'user', { note: 'Manual reset by admin' });
    res.json({ success: true, message: 'Đã đặt lại mật khẩu.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /admin/api/users/:id — Hard delete a user account (requires OTP)
router.delete('/api/users/:id', requireAdminOtp, async (req, res) => {
  try {
    const { id } = req.params;
    if (id === req.session.user.id) {
      return res.status(400).json({ success: false, error: 'Bạn không thể tự xóa tài khoản của chính mình!' });
    }
    await db.collection('users').doc(id).delete();
    await logAdminAction(req, 'HARD_DELETE_USER', id, 'user', { reason: req.adminActionReason });
    res.json({ success: true, message: 'Đã xóa hoàn toàn tài khoản khỏi hệ thống.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /admin/api/users/:id/delete — Hard delete a user account (requires OTP)
router.post('/api/users/:id/delete', requireAdminOtp, async (req, res) => {
  try {
    const { id } = req.params;
    if (id === req.session.user.id) {
      return res.status(400).json({ success: false, error: 'Bạn không thể tự xóa tài khoản của chính mình!' });
    }
    await db.collection('users').doc(id).delete();
    await logAdminAction(req, 'HARD_DELETE_USER', id, 'user', { reason: req.adminActionReason });
    res.json({ success: true, message: 'Đã xóa hoàn toàn tài khoản khỏi hệ thống.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
