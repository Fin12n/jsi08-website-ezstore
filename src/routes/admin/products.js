/**
 * Admin Products Management Routes
 * Moderation, visibility toggle, versions/file hash review, bundle creation.
 */
const express = require('express');
const router = express.Router();
const db = require('../../config/firebase');
const { logAdminAction } = require('../../middlewares/audit-logger');

// GET /admin/products — Products list with advanced filter
router.get('/', async (req, res) => {
  try {
    const { status, sellerId, category } = req.query;
    const [prodSnap, catSnap] = await Promise.all([
      db.collection('products').get(),
      db.collection('categories').orderBy('createdAt', 'asc').get(),
    ]);

    let products = prodSnap.docs.map(doc => ({ docId: doc.id, ...doc.data() }));
    const categories = catSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    if (status && status !== 'all') {
      products = products.filter(p => {
        if (status === 'pending') return !p.status || p.status === 'pending';
        return p.status === status;
      });
    }
    if (sellerId) products = products.filter(p => p.sellerId === sellerId);
    if (category) products = products.filter(p => p.category === category);

    res.render('admin/products', {
      title: 'Quản lý Sản phẩm - EZ Studio',
      activePage: 'products',
      products,
      categories,
      filters: { status, sellerId, category },
      success: req.query.success,
      error: req.query.error,
    });
  } catch (err) {
    res.render('admin/products', { title: 'Sản phẩm', activePage: 'products', products: [], categories: [], filters: {}, error: err.message });
  }
});

// POST /admin/products/:id/approve — Approve product for public display
router.post('/:id/approve', async (req, res) => {
  try {
    await db.collection('products').doc(req.params.id).set({ status: 'approved' }, { merge: true });
    await logAdminAction(req, 'APPROVE_PRODUCT', req.params.id, 'product', {});
    res.redirect('/admin/products?success=Đã duyệt sản phẩm thành công.');
  } catch (err) {
    res.redirect(`/admin/products?error=${err.message}`);
  }
});

// POST /admin/products/:id/reject — Reject (hide) product with reason
router.post('/:id/reject', async (req, res) => {
  try {
    const { rejectionReason } = req.body;
    await db.collection('products').doc(req.params.id).set({
      status: 'hidden',
      rejectionReason: rejectionReason || null,
      rejectedBy: req.session.user.email,
      rejectedAt: new Date().toISOString(),
    }, { merge: true });
    await logAdminAction(req, 'REJECT_PRODUCT', req.params.id, 'product', { reason: rejectionReason });
    res.redirect('/admin/products?success=Đã từ chối và ẩn sản phẩm.');
  } catch (err) {
    res.redirect(`/admin/products?error=${err.message}`);
  }
});

// POST /admin/products/:id/toggle — Toggle product visibility (approved <-> hidden)
router.post('/:id/toggle', async (req, res) => {
  try {
    const doc = await db.collection('products').doc(req.params.id).get();
    if (!doc.exists) return res.status(404).json({ success: false, error: 'Không tìm thấy sản phẩm.' });

    const currentStatus = doc.data().status || 'approved';
    const newStatus = currentStatus === 'hidden' ? 'approved' : 'hidden';

    await db.collection('products').doc(req.params.id).set({ status: newStatus }, { merge: true });
    await logAdminAction(req, 'TOGGLE_PRODUCT', req.params.id, 'product', { from: currentStatus, to: newStatus });

    res.json({ success: true, newStatus, message: `Sản phẩm đã được ${newStatus === 'hidden' ? 'ẩn' : 'hiển thị'}.` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /admin/products/:id/versions — View product file versions and hashes
router.get('/:id/versions', async (req, res) => {
  try {
    const doc = await db.collection('products').doc(req.params.id).get();
    if (!doc.exists) return res.status(404).json({ success: false, error: 'Không tìm thấy sản phẩm.' });
    const data = doc.data();
    res.json({
      success: true,
      productId: req.params.id,
      title: data.title,
      versions: data.versions || [],
      currentFileHash: data.fileHash || null,
      currentFileUrl: data.fileUrl || null,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /admin/products/bundles — Create a bundle from multiple products
router.post('/bundles', async (req, res) => {
  try {
    const { title, description, productIds, bundlePrice, category } = req.body;

    if (!title || !productIds || !bundlePrice) {
      return res.redirect('/admin/products?error=Thiếu thông tin để tạo Bundle.');
    }

    const ids = Array.isArray(productIds) ? productIds : productIds.split(',').map(s => s.trim());
    const cleanId = `bundle-${title.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${Date.now().toString().slice(-4)}`;

    await db.collection('products').doc(cleanId).set({
      id: cleanId,
      title: title.trim(),
      description: description || '',
      isBundle: true,
      bundleProductIds: ids,
      salePrice: bundlePrice,
      originalPrice: null,
      category: category || 'bundles',
      status: 'approved',
      createdBy: req.session.user.email,
      createdAt: new Date().toISOString(),
    });

    await logAdminAction(req, 'CREATE_BUNDLE', cleanId, 'product', { productIds: ids, bundlePrice });
    res.redirect('/admin/products?success=Đã tạo Bundle thành công!');
  } catch (err) {
    res.redirect(`/admin/products?error=${err.message}`);
  }
});

module.exports = router;
