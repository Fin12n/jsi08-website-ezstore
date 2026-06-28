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
      products.push({ docId: doc.id, id: doc.id, ...doc.data() });
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

// GET Edit Product
router.get('/edit-product/:docId', async (req, res) => {
  try {
    const docRef = db.collection('products').doc(req.params.docId);
    const doc = await docRef.get();
    
    if (!doc.exists) {
      return res.redirect('/seller/products?error=Sản phẩm không tồn tại');
    }
    
    const product = { docId: doc.id, ...doc.data() };
    
    // Check ownership
    if (product.sellerId !== req.session.user.id) {
      return res.redirect('/seller/products?error=Bạn không có quyền sửa sản phẩm này');
    }
    
    const catSnapshot = await db.collection('categories').get();
    const categories = [];
    catSnapshot.docs.forEach(cDoc => categories.push({ id: cDoc.id, ...cDoc.data() }));
    
    res.render('seller/edit-product', {
      title: 'Chỉnh sửa sản phẩm - EZ Studio',
      activePage: 'seller-products',
      user: req.session.user,
      product,
      categories
    });
  } catch (error) {
    console.error('❌ Lỗi tải trang sửa sản phẩm:', error);
    res.redirect('/seller/products?error=Lỗi tải dữ liệu');
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

// POST Edit Product
router.post('/edit-product/:docId', upload.single('image'), async (req, res) => {
  try {
    const docRef = db.collection('products').doc(req.params.docId);
    const doc = await docRef.get();
    
    if (!doc.exists) {
      return res.redirect('/seller/products?error=Sản phẩm không tồn tại');
    }
    
    const product = doc.data();
    
    // Check ownership
    if (product.sellerId !== req.session.user.id) {
      return res.redirect('/seller/products?error=Bạn không có quyền sửa sản phẩm này');
    }
    
    const { title, category, price, description } = req.body;
    
    // Check if new image uploaded
    let imageUrl = product.image;
    if (req.file) {
      imageUrl = req.file.path;
    }
    
    const updatedProduct = {
      title: title,
      category: category,
      originalPrice: `${parseInt(price)} zCoin`,
      salePrice: `${parseInt(price)} zCoin`,
      priceNumber: parseInt(price),
      description: description,
      image: imageUrl
    };
    
    await docRef.update(updatedProduct);
    
    res.redirect('/seller/products?success=Cập nhật sản phẩm thành công!');
  } catch (error) {
    console.error('❌ Cập nhật sản phẩm thất bại:', error);
    res.redirect(`/seller/edit-product/${req.params.docId}?error=Cập nhật sản phẩm thất bại!`);
  }
});

// POST Delete Product
router.post('/delete-product/:docId', async (req, res) => {
  try {
    const docRef = db.collection('products').doc(req.params.docId);
    const doc = await docRef.get();
    
    if (!doc.exists) {
      return res.redirect('/seller/products?error=Sản phẩm không tồn tại');
    }
    
    const product = doc.data();
    
    // Check ownership
    if (product.sellerId !== req.session.user.id) {
      return res.redirect('/seller/products?error=Bạn không có quyền xóa sản phẩm này');
    }
    
    await docRef.delete();
    
    res.redirect('/seller/products?success=Xóa sản phẩm thành công!');
  } catch (error) {
    console.error('❌ Xóa sản phẩm thất bại:', error);
    res.redirect('/seller/products?error=Xóa sản phẩm thất bại!');
  }
});

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
      originalPrice: `${parseInt(price)} zCoin`,
      salePrice: `${parseInt(price)} zCoin`,
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
