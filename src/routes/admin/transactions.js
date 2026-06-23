/**
 * Admin Transactions & Topup Routes
 * Manual transaction ledger review and manual topup approval.
 */
const express = require('express');
const router = express.Router();
const db = require('../../config/firebase');
const { requireAdminOtp } = require('../../middlewares/auth');
const { logAdminAction } = require('../../middlewares/audit-logger');
const { creditWallet } = require('../../services/wallet-service');

// GET /admin/transactions — Transaction ledger with filters
router.get('/', async (req, res) => {
  try {
    const { type, status } = req.query;
    const snapshot = await db.collection('orders').orderBy('createdAt', 'desc').get();
    let orders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    if (type && type !== 'all') orders = orders.filter(o => o.type === type);
    if (status && status !== 'all') orders = orders.filter(o => o.status === status);

    res.render('admin/transactions', {
      title: 'Giao dịch - EZ Studio',
      activePage: 'transactions',
      orders,
      filters: { type, status },
      activeTab: req.query.tab || 'orders',
      success: req.query.success,
      error: req.query.error,
    });
  } catch (err) {
    res.render('admin/transactions', { title: 'Giao dịch', activePage: 'transactions', orders: [], filters: {}, activeTab: 'orders', error: err.message });
  }
});

// GET /admin/transactions/:id — Transaction detail
router.get('/:id', async (req, res) => {
  try {
    const doc = await db.collection('orders').doc(req.params.id).get();
    if (!doc.exists) return res.status(404).json({ success: false, error: 'Không tìm thấy giao dịch.' });
    res.json({ success: true, transaction: { id: doc.id, ...doc.data() } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /admin/topup — Topup requests list (bank + card)
router.get('/topup', async (req, res) => {
  // Note: This route is mounted separately under /admin
  try {
    const snapshot = await db.collection('topup_requests').orderBy('timestamp', 'desc').get();
    const topups = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    const bankTopups = topups.filter(t => t.method === 'bank');
    const cardTopups = topups.filter(t => t.method === 'card');

    res.render('admin/transactions', {
      title: 'Nạp tiền - EZ Studio',
      activePage: 'transactions',
      orders: [],
      bankTopups,
      cardTopups,
      filters: {},
      activeTab: 'topup',
      success: req.query.success,
      error: req.query.error,
    });
  } catch (err) {
    res.redirect('/admin/transactions?error=' + err.message);
  }
});

// POST /admin/api/topup/:id/approve — Manually approve a topup request (requires OTP)
router.post('/api/topup/:id/approve', requireAdminOtp, async (req, res) => {
  try {
    const { id } = req.params;
    const topupDoc = await db.collection('topup_requests').doc(id).get();

    if (!topupDoc.exists) {
      return res.status(404).json({ success: false, error: 'Không tìm thấy yêu cầu nạp tiền.' });
    }

    const topupData = topupDoc.data();
    if (topupData.status === 'approved') {
      return res.status(400).json({ success: false, error: 'Yêu cầu này đã được duyệt trước đó.' });
    }

    const adminInfo = { id: req.session.user.id, email: req.session.user.email };
    await creditWallet({
      userId: topupData.userId,
      amount: topupData.amount,
      reason: `Duyệt nạp tiền thủ công bởi Admin - ${req.adminActionReason}`,
      adminInfo,
      req,
    });

    await db.collection('topup_requests').doc(id).set({
      status: 'approved',
      approvedBy: req.session.user.email,
      approvedAt: new Date().toISOString(),
      approvalNote: req.adminActionReason,
    }, { merge: true });

    res.json({ success: true, message: `Đã duyệt nạp ${topupData.amount?.toLocaleString('vi-VN')}đ cho người dùng.` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /admin/api/topup/:id/reject — Reject a topup request
router.post('/api/topup/:id/reject', async (req, res) => {
  try {
    const { id } = req.params;
    const { rejectReason } = req.body;

    await db.collection('topup_requests').doc(id).set({
      status: 'rejected',
      rejectedBy: req.session.user.email,
      rejectedAt: new Date().toISOString(),
      rejectReason: rejectReason || null,
    }, { merge: true });

    await logAdminAction(req, 'REJECT_TOPUP', id, 'topup', { reason: rejectReason });
    res.json({ success: true, message: 'Đã từ chối yêu cầu nạp tiền.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
