/**
 * Admin Dashboard API Routes
 * Provides AJAX data endpoints for the admin overview page.
 * All endpoints return JSON for Chart.js / Alpine.js consumption.
 */
const express = require('express');
const router = express.Router();
const db = require('../../config/firebase');

// GET /admin/api/dashboard/stats
// Returns key metrics: total revenue, wallet balance, new users, pending products
router.get('/stats', async (req, res) => {
  try {
    const [usersSnap, productsSnap, ordersSnap, topupSnap] = await Promise.all([
      db.collection('users').get(),
      db.collection('products').get(),
      db.collection('orders').get(),
      db.collection('topup_requests').get(),
    ]);

    const users = usersSnap.docs.map(d => d.data());
    const products = productsSnap.docs.map(d => d.data());
    const orders = ordersSnap.docs.map(d => d.data());

    const totalRevenue = orders
      .filter(o => o.status === 'completed')
      .reduce((sum, o) => sum + (Number(o.totalAmount) || 0), 0);

    const totalWalletBalance = users
      .reduce((sum, u) => sum + (Number(u.walletBalance) || 0), 0);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const newUsersToday = users.filter(u => {
      if (!u.createdAt) return false;
      return new Date(u.createdAt) >= today;
    }).length;

    const pendingProducts = products.filter(p => p.status === 'pending' || !p.status).length;
    const pendingTopups = topupSnap.docs.filter(d => d.data().status === 'pending').length;

    res.json({
      success: true,
      stats: {
        totalRevenue,
        totalWalletBalance,
        newUsersToday,
        pendingProducts,
        pendingTopups,
        totalUsers: users.length,
        totalProducts: products.length,
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /admin/api/dashboard/revenue-chart?period=day|week|month
// Returns revenue data split by payment method (bank vs card)
router.get('/revenue-chart', async (req, res) => {
  try {
    const period = req.query.period || 'week';
    const ordersSnap = await db.collection('orders').get();
    const topupSnap = await db.collection('topup_requests').get();

    const orders = ordersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const topups = topupSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    // Build date buckets
    const now = new Date();
    const labels = [];
    const bankData = [];
    const cardData = [];

    let buckets = 7;
    if (period === 'month') buckets = 30;
    else if (period === 'day') buckets = 24;

    for (let i = buckets - 1; i >= 0; i--) {
      const date = new Date(now);
      if (period === 'day') {
        date.setHours(now.getHours() - i);
        labels.push(`${date.getHours()}:00`);
      } else {
        date.setDate(now.getDate() - i);
        labels.push(`${date.getDate()}/${date.getMonth() + 1}`);
      }

      const bucketStart = new Date(date);
      const bucketEnd = new Date(date);
      if (period === 'day') {
        bucketStart.setMinutes(0, 0, 0);
        bucketEnd.setMinutes(59, 59, 999);
      } else {
        bucketStart.setHours(0, 0, 0, 0);
        bucketEnd.setHours(23, 59, 59, 999);
      }

      const bankRevenue = topups
        .filter(t => t.method === 'bank' && t.status === 'approved' && t.approvedAt)
        .filter(t => { const d = new Date(t.approvedAt); return d >= bucketStart && d <= bucketEnd; })
        .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);

      const cardRevenue = topups
        .filter(t => t.method === 'card' && t.status === 'approved' && t.approvedAt)
        .filter(t => { const d = new Date(t.approvedAt); return d >= bucketStart && d <= bucketEnd; })
        .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);

      bankData.push(bankRevenue);
      cardData.push(cardRevenue);
    }

    res.json({ success: true, labels, bankData, cardData, period });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /admin/api/dashboard/recent-transactions
// Returns the 10 most recent orders/purchases
router.get('/recent-transactions', async (req, res) => {
  try {
    const snapshot = await db.collection('orders').orderBy('createdAt', 'desc').get();
    const transactions = snapshot.docs.slice(0, 10).map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));
    res.json({ success: true, transactions });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /admin/api/dashboard/activity-feed
// Returns last 20 audit log entries as activity feed
router.get('/activity-feed', async (req, res) => {
  try {
    const snapshot = await db.collection('audit_logs').orderBy('timestamp', 'desc').get();
    const activities = snapshot.docs.slice(0, 20).map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));
    res.json({ success: true, activities });
  } catch (err) {
    // Audit logs might be empty in early stages — return empty gracefully
    res.json({ success: true, activities: [] });
  }
});

module.exports = router;
