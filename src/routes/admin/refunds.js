/**
 * Admin Refunds & Finance Routes
 * Handles refund dispute resolution and financial metrics.
 */
const express = require('express');
const router = express.Router();
const db = require('../../config/firebase');
const { requireAdminOtp } = require('../../middlewares/auth');
const { logAdminAction } = require('../../middlewares/audit-logger');
const { atomicRefund } = require('../../services/wallet-service');

// GET /admin/refunds — Refund requests list
router.get('/', async (req, res) => {
  try {
    const { status } = req.query;
    const snapshot = await db.collection('refund_requests').orderBy('timestamp', 'desc').get();
    let refunds = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    if (status && status !== 'all') {
      refunds = refunds.filter(r => r.status === status);
    }

    res.render('admin/refunds', {
      title: 'Hoàn tiền - EZ Studio',
      activePage: 'refunds',
      refunds,
      filters: { status },
      success: req.query.success,
      error: req.query.error,
    });
  } catch (err) {
    res.render('admin/refunds', { title: 'Hoàn tiền', activePage: 'refunds', refunds: [], filters: {}, error: err.message });
  }
});

// GET /admin/refunds/:id — Refund detail + evidence
router.get('/:id', async (req, res) => {
  try {
    const doc = await db.collection('refund_requests').doc(req.params.id).get();
    if (!doc.exists) return res.status(404).json({ success: false, error: 'Không tìm thấy đơn hoàn tiền.' });

    const data = { id: doc.id, ...doc.data() };

    // Fetch related order info
    let orderData = null;
    if (data.orderId) {
      const orderDoc = await db.collection('orders').doc(data.orderId).get();
      if (orderDoc.exists) orderData = { id: orderDoc.id, ...orderDoc.data() };
    }

    res.json({ success: true, refund: data, order: orderData });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /admin/refunds/:id/approve — Approve refund (atomic transaction, requires OTP)
router.post('/:id/approve', requireAdminOtp, async (req, res) => {
  try {
    const { id } = req.params;
    const refundDoc = await db.collection('refund_requests').doc(id).get();

    if (!refundDoc.exists) {
      return res.status(404).json({ success: false, error: 'Không tìm thấy đơn hoàn tiền.' });
    }

    const refundData = refundDoc.data();
    if (refundData.status !== 'pending') {
      return res.status(400).json({ success: false, error: 'Đơn này đã được xử lý trước đó.' });
    }

    const adminInfo = { id: req.session.user.id, email: req.session.user.email };
    const { buyerNewBalance, sellerNewBalance } = await atomicRefund({
      buyerId: refundData.buyerId,
      sellerId: refundData.sellerId,
      amount: refundData.amount,
      orderId: refundData.orderId,
      reason: req.adminActionReason,
      adminInfo,
      req,
    });

    // Update refund status
    await db.collection('refund_requests').doc(id).set({
      status: 'approved',
      resolvedBy: req.session.user.email,
      resolvedAt: new Date().toISOString(),
      resolutionNote: req.adminActionReason,
    }, { merge: true });

    res.json({
      success: true,
      message: 'Hoàn tiền thành công (atomic transaction).',
      buyerNewBalance,
      sellerNewBalance,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /admin/refunds/:id/reject — Reject refund request
router.post('/:id/reject', async (req, res) => {
  try {
    const { id } = req.params;
    const { rejectReason } = req.body;

    await db.collection('refund_requests').doc(id).set({
      status: 'rejected',
      resolvedBy: req.session.user.email,
      resolvedAt: new Date().toISOString(),
      resolutionNote: rejectReason || 'Khiếu nại không đủ bằng chứng.',
    }, { merge: true });

    await logAdminAction(req, 'REJECT_REFUND', id, 'refund', { reason: rejectReason });
    res.json({ success: true, message: 'Đã từ chối yêu cầu hoàn tiền.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /admin/finance/metrics — Financial statistics overview
router.get('/finance/metrics', async (req, res) => {
  try {
    const [ordersSnap, refundsSnap, topupsSnap, walletTxSnap] = await Promise.all([
      db.collection('orders').get(),
      db.collection('refund_requests').get(),
      db.collection('topup_requests').get(),
      db.collection('wallet_transactions').get(),
    ]);

    const orders = ordersSnap.docs.map(d => d.data());
    const refunds = refundsSnap.docs.map(d => d.data());
    const topups = topupsSnap.docs.map(d => d.data());
    const walletTxs = walletTxSnap.docs.map(d => d.data());

    const totalRevenue = orders.filter(o => o.status === 'completed')
      .reduce((sum, o) => sum + (Number(o.totalAmount) || 0), 0);
    const totalRefunded = refunds.filter(r => r.status === 'approved')
      .reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
    const totalTopupBank = topups.filter(t => t.method === 'bank' && t.status === 'approved')
      .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
    const totalTopupCard = topups.filter(t => t.method === 'card' && t.status === 'approved')
      .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
    const refundRate = orders.length > 0 ? ((refunds.filter(r => r.status === 'approved').length / orders.length) * 100).toFixed(2) : 0;

    res.json({
      success: true,
      metrics: {
        totalRevenue, totalRefunded, totalTopupBank, totalTopupCard, refundRate,
        totalOrders: orders.length,
        pendingRefunds: refunds.filter(r => r.status === 'pending').length,
        approvedRefunds: refunds.filter(r => r.status === 'approved').length,
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
