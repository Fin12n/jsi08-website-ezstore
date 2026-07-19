/**
 * Admin Sellers Management Routes
 * Handles seller applications: approval, rejection, ban, bank info review.
 */
const express = require('express');
const router = express.Router();
const db = require('../../config/firebase');
const { requireAdminOtp } = require('../../middlewares/auth');
const { logAdminAction } = require('../../middlewares/audit-logger');
const { sendEmail } = require('../../config/email');

// GET /admin/sellers — Overview of active sellers + tab for applications
router.get('/', async (req, res) => {
  try {
    const [sellersSnap, appsSnap] = await Promise.all([
      db.collection('users').where('role', '==', 'seller').get(),
      db.collection('seller_applications').where('status', '==', 'PENDING').get(),
    ]);

    const sellers = sellersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const pendingApplications = appsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    res.render('admin/sellers', {
      title: 'Quản lý Người bán - EZ Studio',
      activePage: 'sellers',
      sellers,
      pendingApplications,
      pendingCount: pendingApplications.length,
      activeTab: req.query.tab || 'active',
      success: req.query.success,
      error: req.query.error,
    });
  } catch (err) {
    res.render('admin/sellers', { title: 'Người bán', activePage: 'sellers', sellers: [], pendingApplications: [], pendingCount: 0, activeTab: 'active', error: err.message });
  }
});

// GET /admin/sellers/applications — Pending applications list (alias)
router.get('/applications', async (req, res) => {
  return res.redirect('/admin/sellers?tab=pending');
});

// POST /admin/sellers/:id/approve — Approve seller application
router.post('/:id/approve', async (req, res) => {
  try {
    const { id } = req.params;
    const appDoc = await db.collection('seller_applications').doc(id).get();
    if (!appDoc.exists) {
      return res.redirect('/admin/sellers?error=Không tìm thấy đơn đăng ký.');
    }

    const appData = appDoc.data();

    // Upgrade user to seller role
    await db.collection('users').doc(appData.userId).set(
      { role: 'seller', sellerSince: new Date().toISOString() },
      { merge: true }
    );

    // Update application status
    await db.collection('seller_applications').doc(id).set({
      status: 'APPROVED',
      reviewedBy: req.session.user.email,
      reviewedAt: new Date().toISOString(),
    }, { merge: true });

    await logAdminAction(req, 'APPROVE_SELLER', id, 'seller', { userId: appData.userId });

    // Send congratulations email if email service is available
    if (appData.email) {
      try {
        await sendEmail({
          to: appData.email,
          subject: '🎉 Đơn đăng ký Seller của bạn đã được duyệt!',
          html: `<h2>Chúc mừng!</h2><p>Tài khoản của bạn đã được nâng cấp lên quyền <strong>Seller</strong> trên EZ Studio. Bạn có thể đăng sản phẩm ngay bây giờ.</p>`,
        });
      } catch (emailErr) {
        console.warn('[SELLER] Email notification failed:', emailErr.message);
      }
    }

    res.redirect('/admin/sellers?success=Đã duyệt Seller thành công!');
  } catch (err) {
    res.redirect(`/admin/sellers?error=${err.message}`);
  }
});

// POST /admin/sellers/:id/reject — Reject seller application with reason
router.post('/:id/reject', async (req, res) => {
  try {
    const { id } = req.params;
    const { rejectionReason } = req.body;

    const appDoc = await db.collection('seller_applications').doc(id).get();
    if (!appDoc.exists) return res.redirect('/admin/sellers?error=Không tìm thấy đơn đăng ký.');
    const appData = appDoc.data();

    await db.collection('seller_applications').doc(id).set({
      status: 'REJECTED',
      rejectionReason: rejectionReason || 'Không đáp ứng tiêu chuẩn.',
      reviewedBy: req.session.user.email,
      reviewedAt: new Date().toISOString(),
    }, { merge: true });

    await logAdminAction(req, 'REJECT_SELLER', id, 'seller', { userId: appData.userId, reason: rejectionReason });

    // Notify applicant of rejection with reason
    if (appData.email) {
      try {
        await sendEmail({
          to: appData.email,
          subject: 'Đơn đăng ký Seller của bạn chưa được chấp nhận',
          html: `<h2>Thông báo</h2><p>Rất tiếc, đơn đăng ký Seller của bạn chưa được chấp thuận tại thời điểm này.</p><p><strong>Lý do:</strong> ${rejectionReason || 'Không đáp ứng tiêu chuẩn.'}</p><p>Bạn có thể điều chỉnh và nộp lại sau.</p>`,
        });
      } catch (emailErr) {
        console.warn('[SELLER] Rejection email failed:', emailErr.message);
      }
    }

    res.redirect('/admin/sellers?success=Đã từ chối đơn đăng ký.');
  } catch (err) {
    res.redirect(`/admin/sellers?error=${err.message}`);
  }
});

// POST /admin/sellers/:id/ban — Ban seller + hide all their products (requires OTP)
router.post('/:id/ban', requireAdminOtp, async (req, res) => {
  try {
    const { id } = req.params; // This is the seller's user ID

    // Downgrade role and ban
    await db.collection('users').doc(id).set({
      role: 'user', // Demote to regular user
      bannedAt: new Date().toISOString(),
      banReason: req.adminActionReason,
      bannedBy: req.session.user.email,
    }, { merge: true });

    // Hide all products belonging to this seller
    const productsSnap = await db.collection('products').where('sellerId', '==', id).get();
    const hidePromises = productsSnap.docs.map(doc =>
      db.collection('products').doc(doc.id).set({ status: 'hidden' }, { merge: true })
    );
    await Promise.all(hidePromises);

    await logAdminAction(req, 'BAN_SELLER', id, 'seller', {
      reason: req.adminActionReason,
      productsHidden: productsSnap.docs.length,
    });

    res.json({
      success: true,
      message: `Đã cấm Seller và ẩn ${productsSnap.docs.length} sản phẩm.`,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /admin/sellers/:id/bank-info — View seller's bank information
router.get('/:id/bank-info', async (req, res) => {
  try {
    const { id } = req.params;
    const userDoc = await db.collection('users').doc(id).get();
    if (!userDoc.exists) {
      return res.status(404).json({ success: false, error: 'Không tìm thấy người bán.' });
    }
    const userData = userDoc.data();
    await logAdminAction(req, 'VIEW_BANK_INFO', id, 'seller', {});
    res.json({
      success: true,
      bankInfo: userData.bankInfo || null,
      displayName: userData.displayName,
      email: userData.email,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
