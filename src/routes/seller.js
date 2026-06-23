const express = require('express');
const router = express.Router();
const db = require('../config/firebase');
const { isSeller } = require('../middlewares/auth');

// Apply seller middleware
router.use(isSeller);

// GET Seller Dashboard
router.get('/dashboard', async (req, res) => {
  try {
    const productsSnapshot = await db.collection('products')
      .where('sellerId', '==', req.session.user.id)
      .get();
      
    let totalViews = 0;
    let totalSales = 0;
    const products = [];

    productsSnapshot.docs.forEach(doc => {
      const data = doc.data();
      products.push({ id: doc.id, ...data });
      totalViews += (data.views || 0);
      totalSales += (data.sales || 0);
    });

    res.render('seller/dashboard', {
      title: 'Bảng điều khiển Người bán - EZ Studio',
      activePage: 'seller-dashboard',
      user: req.session.user,
      productsCount: products.length,
      totalViews,
      totalSales
    });
  } catch (error) {
    res.redirect('/?error=Lỗi tải dữ liệu seller');
  }
});

// GET Seller Products
router.get('/products', async (req, res) => {
  try {
    const productsSnapshot = await db.collection('products')
      .where('sellerId', '==', req.session.user.id)
      .get();
      
    const products = [];
    productsSnapshot.docs.forEach(doc => {
      products.push({ id: doc.id, ...doc.data() });
    });

    res.render('seller/products', {
      title: 'Quản lý Sản phẩm - EZ Studio',
      activePage: 'seller-products',
      user: req.session.user,
      products
    });
  } catch (error) {
    res.redirect('/seller/dashboard?error=Lỗi tải danh sách sản phẩm');
  }
});

// GET Add Product
router.get('/add-product', async (req, res) => {
  try {
    const catSnapshot = await db.collection('categories').get();
    const categories = [];
    catSnapshot.docs.forEach(doc => categories.push({ id: doc.id, ...doc.data() }));

    res.render('seller/add-product', {
      title: 'Đăng sản phẩm mới - EZ Studio',
      activePage: 'seller-add-product',
      categories
    });
  } catch (error) {
    res.redirect('/seller/dashboard?error=Lỗi tải danh mục');
  }
});

// For Cloudinary uploads
const { upload } = require('../config/cloudinary');

// POST Add Product
// We'll just use upload.single('image') to mock the file upload too, since Cloudinary handles media.
router.post('/add-product', upload.single('image'), async (req, res) => {
  try {
    const { title, category, price, description } = req.body;
    
    // Convert Vietnamese title to ID
    const generatedId = title.toLowerCase().replace(/ /g, '-').replace(/[^\w-]+/g, '');
    
    // The uploaded image from Cloudinary
    let imageUrl = '/imgs/logo.webp';
    if (req.file) {
      imageUrl = req.file.path;
    }

    const newProduct = {
      id: generatedId,
      title: title,
      category: category,
      originalPrice: new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(parseInt(price)),
      salePrice: new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(parseInt(price)),
      priceNumber: parseInt(price),
      description: description,
      image: imageUrl,
      sellerId: req.session.user.id,
      sellerName: req.session.user.username,
      status: 'PENDING',
      views: 0,
      sales: 0,
      createdAt: new Date().toISOString()
    };

    await db.collection('products').add(newProduct);
    
    res.redirect('/seller/products?success=Sản phẩm đã được gửi duyệt thành công!');
  } catch (error) {
    console.error('❌ Thêm sản phẩm seller thất bại:', error);
    res.redirect('/seller/add-product?error=Thêm sản phẩm thất bại!');
  }
});

module.exports = router;
