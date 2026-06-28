const express = require('express');
const router = express.Router();
const db = require('../config/firebase');
const { upload } = require('../config/cloudinary');
const { isAdmin } = require('../middlewares/auth');

// Middleware to apply to all admin routes
router.use(isAdmin);

// --- VIEWS ---

// Redirect root admin to overview
router.get('/', (req, res) => {
  res.redirect('/admin/overview');
});

// GET Overview
router.get('/overview', async (req, res) => {
  try {
    const catSnapshot = await db.collection('categories').orderBy('createdAt', 'asc').get();
    const categories = [];
    catSnapshot.docs.forEach(doc => categories.push({ id: doc.id, ...doc.data() }));

    res.render('admin/overview', { 
      title: 'Tổng quan - EZ Studio', 
      activePage: 'overview',
      categories,
      success: req.query.success,
      error: req.query.error
    });
  } catch (error) {
    res.render('admin/overview', { title: 'Tổng quan', activePage: 'overview', categories: [], error: 'Lỗi tải dữ liệu' });
  }
});

// GET Categories
router.get('/categories', async (req, res) => {
  try {
    const snapshot = await db.collection('categories').orderBy('createdAt', 'asc').get();
    const categories = [];
    snapshot.docs.forEach(doc => {
      categories.push({ id: doc.id, ...doc.data() });
    });
    
    res.render('admin/categories', { 
      title: 'Danh mục - EZ Studio', 
      activePage: 'categories',
      categories,
      success: req.query.success,
      error: req.query.error
    });
  } catch (error) {
    res.render('admin/categories', { title: 'Danh mục', activePage: 'categories', categories: [], error: 'Lỗi khi tải dữ liệu' });
  }
});

// GET Products
router.get('/products', async (req, res) => {
  try {
    const [prodSnapshot, catSnapshot] = await Promise.all([
      db.collection('products').get(),
      db.collection('categories').orderBy('createdAt', 'asc').get()
    ]);
    
    const products = [];
    prodSnapshot.docs.forEach(doc => {
      products.push({ docId: doc.id, ...doc.data() });
    });

    const categories = [];
    catSnapshot.docs.forEach(doc => {
      categories.push({ id: doc.id, ...doc.data() });
    });
    
    res.render('admin/products', { 
      title: 'Sản phẩm - EZ Studio', 
      activePage: 'products',
      products,
      categories,
      success: req.query.success,
      error: req.query.error
    });
  } catch (error) {
    console.error('Error fetching products:', error);
    res.render('admin/products', { title: 'Sản phẩm', activePage: 'products', products: [], categories: [], error: 'Lỗi khi tải dữ liệu sản phẩm' });
  }
});

// GET Users
router.get('/users', async (req, res) => {
  try {
    const snapshot = await db.collection('users').get();
    const usersList = [];
    snapshot.docs.forEach(doc => {
      usersList.push({ id: doc.id, ...doc.data() });
    });
    
    res.render('admin/users', { 
      title: 'Người dùng - EZ Studio', 
      activePage: 'users',
      usersList,
      success: req.query.success,
      error: req.query.error
    });
  } catch (error) {
    res.render('admin/users', { title: 'Người dùng', activePage: 'users', usersList: [], error: 'Lỗi khi tải dữ liệu người dùng' });
  }
});

// GET Orders
router.get('/orders', async (req, res) => {
  try {
    const snapshot = await db.collection('orders').orderBy('createdAt', 'desc').get();
    const orders = [];
    snapshot.docs.forEach(doc => {
      orders.push({ id: doc.id, ...doc.data() });
    });
    
    res.render('admin/orders', { 
      title: 'Đơn hàng - EZ Studio', 
      activePage: 'orders',
      orders,
      success: req.query.success,
      error: req.query.error
    });
  } catch (error) {
    res.render('admin/orders', { title: 'Đơn hàng', activePage: 'orders', orders: [], error: 'Lỗi khi tải dữ liệu đơn hàng' });
  }
});

// GET Coupons
router.get('/coupons', async (req, res) => {
  try {
    const snapshot = await db.collection('coupons').get();
    const coupons = [];
    snapshot.docs.forEach(doc => {
      coupons.push({ id: doc.id, ...doc.data() });
    });
    
    res.render('admin/coupons', { 
      title: 'Mã giảm giá - EZ Studio', 
      activePage: 'coupons',
      coupons,
      success: req.query.success,
      error: req.query.error
    });
  } catch (error) {
    res.render('admin/coupons', { title: 'Khuyến mãi', activePage: 'coupons', coupons: [], error: 'Lỗi tải mã giảm giá' });
  }
});

// GET Settings page moved to routes/admin/settings.js

// --- API ACTIONS ---

// POST Add Product (handles file upload)
router.post('/products/add', upload.single('image'), async (req, res) => {
  try {
    const { title, description, originalPrice, salePrice, category, features, itemsList, plugins, gifts } = req.body;
    
    if (!title || !description || !salePrice) {
      return res.redirect('/admin/products?error=Vui lòng nhập đầy đủ thông tin!');
    }

    const cleanId = title.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s-]/g, '').replace(/[\s-]+/g, '-').trim();
    const productId = `${cleanId}-${Date.now().toString().slice(-4)}`;

    let imageUrl = '/imgs/logo.webp';
    if (req.file) {
      imageUrl = req.file.path.startsWith('http') ? req.file.path : `/uploads/${req.file.filename}`;
    }

    const arrayFeatures = features ? features.split(',').map(x => x.trim()).filter(Boolean) : [];
    const arrayItems = itemsList ? itemsList.split(',').map(x => x.trim()).filter(Boolean) : [];
    const arrayPlugins = plugins ? plugins.split(',').map(x => x.trim()).filter(Boolean) : [];
    const arrayGifts = gifts ? gifts.split(',').map(x => x.trim()).filter(Boolean) : [];

    const newProduct = {
      id: productId,
      title: title.trim(),
      description: description.trim(),
      image: imageUrl,
      originalPrice: originalPrice ? originalPrice.trim() : 'Free',
      salePrice: salePrice.trim(),
      category: category || 'models',
      carousel: [imageUrl],
      features: arrayFeatures,
      itemsList: arrayItems,
      plugins: arrayPlugins,
      gifts: arrayGifts,
      createdAt: new Date().toISOString()
    };

    await db.collection('products').doc(productId).set(newProduct);
    res.redirect('/admin/products?success=Thêm sản phẩm thành công!');
  } catch (error) {
    console.error('Error adding product:', error);
    res.redirect(`/admin/products?error=Thêm sản phẩm thất bại: ${error.message}`);
  }
});

// POST Delete Product
router.post('/products/delete/:docId', async (req, res) => {
  try {
    await db.collection('products').doc(req.params.docId).delete();
    res.redirect('/admin/products?success=Đã xóa sản phẩm thành công!');
  } catch (error) {
    res.redirect(`/admin/products?error=Xóa sản phẩm thất bại: ${error.message}`);
  }
});

// --- API: CATEGORIES ---
router.post('/categories/add', async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name) return res.redirect('/admin/categories?error=Vui lòng nhập tên danh mục!');

    const slug = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s-]/g, '').replace(/[\s-]+/g, '-').trim();
    
    await db.collection('categories').doc(slug).set({
      name: name.trim(),
      slug: slug,
      description: description ? description.trim() : '',
      createdAt: new Date().toISOString()
    });
    
    res.redirect('/admin/categories?success=Đã thêm danh mục thành công!');
  } catch (error) {
    res.redirect(`/admin/categories?error=Lỗi thêm danh mục: ${error.message}`);
  }
});

router.post('/categories/:id/delete', async (req, res) => {
  try {
    await db.collection('categories').doc(req.params.id).delete();
    res.redirect('/admin/categories?success=Đã xóa danh mục!');
  } catch (error) {
    res.redirect(`/admin/categories?error=Lỗi xóa danh mục: ${error.message}`);
  }
});

// --- API: SETTINGS ---
router.post('/api/settings', async (req, res) => {
  try {
    const { type, exchangeRate, bankName, accountName, accountNumber } = req.body;
    const docRef = db.collection('settings').doc('general');
    
    if (type === 'exchange') {
      await docRef.set({ exchangeRate: Number(exchangeRate) }, { merge: true });
      res.redirect('/admin/settings?success=Cập nhật tỷ giá thành công!');
    } else if (type === 'bank') {
      await docRef.set({ bankInfo: { bankName, accountName, accountNumber } }, { merge: true });
      res.redirect('/admin/settings?success=Cập nhật thông tin ngân hàng thành công!');
    }
  } catch (error) {
    res.redirect(`/admin/settings?error=Lỗi cập nhật cài đặt: ${error.message}`);
  }
});

router.post('/api/settings/banner', upload.single('banner'), async (req, res) => {
  try {
    if (!req.file) return res.redirect('/admin/settings?error=Vui lòng chọn ảnh');
    const imageUrl = req.file.path.startsWith('http') ? req.file.path : `/uploads/${req.file.filename}`;
    
    await db.collection('settings').doc('general').set({
      banners: db.FieldValue ? db.FieldValue.arrayUnion(imageUrl) : [imageUrl] // Simplified array push
    }, { merge: true });
    
    res.redirect('/admin/settings?success=Cập nhật banner thành công!');
  } catch (error) {
    res.redirect(`/admin/settings?error=Lỗi cập nhật banner: ${error.message}`);
  }
});

// --- API: COUPONS ---
router.post('/api/coupons', async (req, res) => {
  try {
    const { code, discountType, discountValue, limit, expiryDate } = req.body;
    const couponId = code.toUpperCase().trim();
    
    await db.collection('coupons').doc(couponId).set({
      code: couponId,
      discountType,
      discountValue: Number(discountValue),
      limit: limit ? Number(limit) : null,
      usedCount: 0,
      expiryDate: expiryDate || null,
      createdAt: new Date().toISOString()
    });
    
    res.redirect('/admin/coupons?success=Tạo mã giảm giá thành công!');
  } catch (error) {
    res.redirect(`/admin/coupons?error=Lỗi tạo mã: ${error.message}`);
  }
});

router.post('/api/coupons/:id/delete', async (req, res) => {
  try {
    await db.collection('coupons').doc(req.params.id).delete();
    res.redirect('/admin/coupons?success=Đã xóa mã giảm giá!');
  } catch (error) {
    res.redirect(`/admin/coupons?error=Lỗi xóa mã: ${error.message}`);
  }
});

// --- API: ORDERS ---
router.post('/orders/:id/confirm', async (req, res) => {
  try {
    await db.collection('orders').doc(req.params.id).update({
      status: 'completed',
      updatedAt: new Date().toISOString()
    });
    // Todo: Trigger SMTP email to user
    res.redirect('/admin/orders?success=Đã duyệt đơn hàng thành công!');
  } catch (error) {
    res.redirect(`/admin/orders?error=Lỗi duyệt đơn: ${error.message}`);
  }
});

// GET Applications (Seller Approvals)
router.get('/applications', async (req, res) => {
  try {
    const appsSnapshot = await db.collection('audit_logs')
      .where('type', '==', 'SELLER_APPLICATION')
      .where('status', '==', 'PENDING')
      .get();
      
    const applications = [];
    appsSnapshot.docs.forEach(doc => {
      applications.push({ id: doc.id, ...doc.data() });
    });

    res.render('admin/applications', {
      title: 'Duyệt Seller - Admin',
      activePage: 'applications',
      applications
    });
  } catch (error) {
    res.redirect('/admin?error=Lỗi tải danh sách yêu cầu');
  }
});

// POST Approve Seller
router.post('/applications/:id/approve', async (req, res) => {
  try {
    const appId = req.params.id;
    const appDoc = await db.collection('audit_logs').doc(appId).get();
    
    if (appDoc.exists) {
      const appData = appDoc.data();
      
      // Upgrade user role to seller
      await db.collection('users').doc(appData.userId).set({
        role: 'seller'
      }, { merge: true });
      
      // Update app status
      await db.collection('audit_logs').doc(appId).set({
        status: 'APPROVED'
      }, { merge: true });
    }
    
    res.redirect('/admin/applications?success=Đã duyệt yêu cầu Seller thành công');
  } catch (error) {
    res.redirect('/admin/applications?error=Lỗi khi duyệt');
  }
});

// POST Reject Seller
router.post('/applications/:id/reject', async (req, res) => {
  try {
    const appId = req.params.id;
    await db.collection('audit_logs').doc(appId).set({
      status: 'REJECTED'
    }, { merge: true });
    
    res.redirect('/admin/applications?success=Đã từ chối yêu cầu');
  } catch (error) {
    res.redirect('/admin/applications?error=Lỗi khi từ chối');
  }
});

// POST Approve Product
router.post('/products/approve/:id', async (req, res) => {
  try {
    await db.collection('products').doc(req.params.id).set({
      status: 'APPROVED'
    }, { merge: true });
    res.redirect('/admin/products?success=Đã duyệt sản phẩm thành công');
  } catch (error) {
    res.redirect('/admin/products?error=Lỗi khi duyệt sản phẩm');
  }
});

// POST Reject/Hide Product
router.post('/products/reject/:id', async (req, res) => {
  try {
    await db.collection('products').doc(req.params.id).set({
      status: 'HIDDEN'
    }, { merge: true });
    res.redirect('/admin/products?success=Đã từ chối (ẩn) sản phẩm');
  } catch (error) {
    res.redirect('/admin/products?error=Lỗi khi từ chối sản phẩm');
  }
});

module.exports = router;
