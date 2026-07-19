/**
 * Admin Products Management Routes
 * Moderation, visibility toggle, versions/file hash review, bundle creation.
 */
const express = require('express');
const router = express.Router();
const db = require('../../config/firebase');
const { logAdminAction } = require('../../middlewares/audit-logger');
const { upload, cloudinary, isCloudinaryActive } = require('../../config/cloudinary');
const fs = require('fs');
const path = require('path');

// Helper to upload base64 images (either to Cloudinary or local folder fallback)
async function uploadBase64Image(base64Str) {
  if (isCloudinaryActive) {
    const result = await cloudinary.uploader.upload(base64Str, {
      folder: 'ez-studio',
      transformation: [{ width: 1200, height: 900, crop: 'limit' }]
    });
    return result.secure_url || result.url;
  } else {
    const matches = base64Str.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
      throw new Error('Invalid base64 image format');
    }
    const ext = matches[1].split('/')[1] || 'png';
    const buffer = Buffer.from(matches[2], 'base64');
    const filename = `gallery-${Date.now()}-${Math.round(Math.random() * 1E9)}.${ext}`;
    const uploadDir = path.join(__dirname, '../../public/uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    fs.writeFileSync(path.join(uploadDir, filename), buffer);
    return `/uploads/${filename}`;
  }
}


// GET /admin/products/new — Form to create a new product
router.get('/new', async (req, res) => {
  try {
    const catSnap = await db.collection('categories').orderBy('createdAt', 'asc').get();
    const categories = catSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    res.render('admin/products-new', {
      title: 'Đăng sản phẩm mới - Admin',
      activePage: 'products',
      categories,
      success: req.query.success,
      error: req.query.error
    });
  } catch (err) {
    res.redirect(`/admin/products?error=${encodeURIComponent(err.message)}`);
  }
});

// POST /admin/products/new — Process creation of a new product
router.post('/new', upload.single('image'), async (req, res) => {
  try {
    const { 
      title, description, originalPrice, salePrice, category, 
      features, itemsList, plugins, gifts, customFields, 
      galleryBase64, imageStr, productId, versionNumber, 
      versionChangelog, versionFileKey, versionFileName, versionFileSize 
    } = req.body;
    
    if (!title || !description || !salePrice) {
      return res.redirect('/admin/products/new?error=Vui lòng nhập đầy đủ thông tin!');
    }

    const cleanId = title.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s-]/g, '').replace(/[\s-]+/g, '-').trim();
    const finalProductId = productId || `${cleanId}-${Date.now().toString().slice(-4)}`;

    let imageUrl = '/imgs/logo.webp';
    if (imageStr && imageStr.startsWith('data:image/')) {
      try {
        imageUrl = await uploadBase64Image(imageStr);
      } catch (err) {
        console.error('Failed to upload thumbnail base64:', err);
      }
    } else if (req.file) {
      imageUrl = req.file.path.startsWith('http') ? req.file.path : `/uploads/${req.file.filename}`;
    }

    const arrayFeatures = features ? features.split(',').map(x => x.trim()).filter(Boolean) : [];
    const arrayItems = itemsList ? itemsList.split(',').map(x => x.trim()).filter(Boolean) : [];
    const arrayPlugins = plugins ? plugins.split(',').map(x => x.trim()).filter(Boolean) : [];
    const arrayGifts = gifts ? gifts.split(',').map(x => x.trim()).filter(Boolean) : [];

    const priceNum = parseInt(salePrice);
    const origPriceNum = originalPrice ? parseInt(originalPrice) : priceNum;

    const cleanCustomFields = {};
    if (customFields && typeof customFields === 'object') {
      for (const [k, v] of Object.entries(customFields)) {
        if (v !== undefined && v !== null && v !== '') {
          if (!isNaN(v) && v.trim() !== '') {
            cleanCustomFields[k] = Number(v);
          } else {
            cleanCustomFields[k] = v.trim();
          }
        }
      }
    }

    // Process new gallery images
    const carouselUrls = [imageUrl];
    if (galleryBase64) {
      const base64List = Array.isArray(galleryBase64) ? galleryBase64 : [galleryBase64];
      for (const base64Str of base64List) {
        if (base64Str && base64Str.startsWith('data:image/')) {
          try {
            const uploadedUrl = await uploadBase64Image(base64Str);
            carouselUrls.push(uploadedUrl);
          } catch (err) {
            console.error('Failed to upload gallery image:', err);
          }
        }
      }
    }

    // Process initial version file if uploaded
    const versions = [];
    if (versionFileKey && versionFileKey.trim() !== '') {
      versions.push({
        version: versionNumber ? versionNumber.trim() : '1.0.0',
        changelog: versionChangelog ? versionChangelog.trim() : 'Bản phát hành đầu tiên',
        fileKey: versionFileKey.trim(),
        fileName: versionFileName ? versionFileName.trim() : 'resource-file',
        fileSize: Number(versionFileSize) || 0,
        uploadedAt: new Date().toISOString()
      });
    }

    const newProduct = {
      id: finalProductId,
      title: title.trim(),
      description: description.trim(),
      image: imageUrl,
      originalPrice: `${origPriceNum} zCoin`,
      salePrice: `${priceNum} zCoin`,
      priceNumber: priceNum,
      category: category || '',
      carousel: carouselUrls,
      features: arrayFeatures,
      itemsList: arrayItems,
      plugins: arrayPlugins,
      gifts: arrayGifts,
      customFields: cleanCustomFields,
      status: 'approved',
      versions: versions,
      createdAt: new Date().toISOString()
    };

    await db.collection('products').doc(finalProductId).set(newProduct);
    await logAdminAction(req, 'CREATE_PRODUCT', finalProductId, 'product', { title: newProduct.title });
    res.redirect('/admin/products?success=Thêm sản phẩm thành công!');
  } catch (error) {
    console.error('Error adding product:', error);
    res.redirect(`/admin/products/new?error=${encodeURIComponent(error.message)}`);
  }
});

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
      salePrice: `${parseInt(bundlePrice)} zCoin`,
      originalPrice: null,
      priceNumber: parseInt(bundlePrice),
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

// GET /admin/products/:id/edit — Show edit product page
router.get('/:id/edit', async (req, res) => {
  try {
    const [prodDoc, catSnap] = await Promise.all([
      db.collection('products').doc(req.params.id).get(),
      db.collection('categories').orderBy('createdAt', 'asc').get()
    ]);

    if (!prodDoc.exists) {
      return res.redirect('/admin/products?error=Sản phẩm không tồn tại.');
    }

    const product = { docId: prodDoc.id, ...prodDoc.data() };
    const categories = catSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    res.render('admin/products-edit', {
      title: 'Chỉnh sửa sản phẩm - Admin',
      activePage: 'products',
      product,
      categories,
      success: req.query.success,
      error: req.query.error
    });
  } catch (err) {
    res.redirect(`/admin/products?error=${encodeURIComponent(err.message)}`);
  }
});

router.post('/:id/edit', upload.single('image'), async (req, res) => {
  try {
    const { title, price, originalPrice, category, description, features, itemsList, plugins, gifts, customFields, existingGallery, galleryBase64, imageStr } = req.body;
    
    if (!title || !price) {
      return res.redirect(`/admin/products/${req.params.id}/edit?error=Tên và giá sản phẩm là bắt buộc.`);
    }

    const docRef = db.collection('products').doc(req.params.id);
    const doc = await docRef.get();
    if (!doc.exists) {
      return res.redirect('/admin/products?error=Sản phẩm không tồn tại.');
    }
    const currentData = doc.data();

    const priceNum = parseInt(price);
    const origPriceNum = originalPrice ? parseInt(originalPrice) : priceNum;

    let imageUrl = currentData.image || '/imgs/logo.webp';
    if (imageStr && imageStr.startsWith('data:image/')) {
      try {
        imageUrl = await uploadBase64Image(imageStr);
      } catch (err) {
        console.error('Failed to upload thumbnail base64:', err);
      }
    } else if (req.file) {
      imageUrl = req.file.path.startsWith('http') ? req.file.path : `/uploads/${req.file.filename}`;
    }

    const arrayFeatures = features ? features.split(',').map(x => x.trim()).filter(Boolean) : [];
    const arrayItems = itemsList ? itemsList.split(',').map(x => x.trim()).filter(Boolean) : [];
    const arrayPlugins = plugins ? plugins.split(',').map(x => x.trim()).filter(Boolean) : [];
    const arrayGifts = gifts ? gifts.split(',').map(x => x.trim()).filter(Boolean) : [];

    const cleanCustomFields = {};
    if (customFields && typeof customFields === 'object') {
      for (const [k, v] of Object.entries(customFields)) {
        if (v !== undefined && v !== null && v !== '') {
          if (!isNaN(v) && v.trim() !== '') {
            cleanCustomFields[k] = Number(v);
          } else {
            cleanCustomFields[k] = v.trim();
          }
        }
      }
    }

    // Process gallery updates
    // Keep existing images (excluding current main image URL to prevent duplicates)
    const keptUrls = (existingGallery ? (Array.isArray(existingGallery) ? existingGallery : [existingGallery]) : []).filter(u => u !== imageUrl);
    
    // Process new base64 uploads
    const newUrls = [];
    if (galleryBase64) {
      const base64List = Array.isArray(galleryBase64) ? galleryBase64 : [galleryBase64];
      for (const base64Str of base64List) {
        if (base64Str && base64Str.startsWith('data:image/')) {
          try {
            const uploadedUrl = await uploadBase64Image(base64Str);
            newUrls.push(uploadedUrl);
          } catch (err) {
            console.error('Failed to upload gallery image:', err);
          }
        }
      }
    }

    const carouselUrls = [imageUrl, ...keptUrls, ...newUrls];

    const updateData = {
      title: title.trim(),
      salePrice: `${priceNum} zCoin`,
      originalPrice: `${origPriceNum} zCoin`,
      priceNumber: priceNum,
      category: (category || '').trim(),
      description: description.trim(),
      image: imageUrl,
      carousel: carouselUrls,
      features: arrayFeatures,
      itemsList: arrayItems,
      plugins: arrayPlugins,
      gifts: arrayGifts,
      customFields: cleanCustomFields,
      updatedAt: new Date().toISOString(),
      updatedByAdmin: req.session.user.email,
    };

    await docRef.set(updateData, { merge: true });
    await logAdminAction(req, 'EDIT_PRODUCT', req.params.id, 'product', { title, price: priceNum });
    res.redirect('/admin/products?success=Đã cập nhật sản phẩm thành công.');
  } catch (err) {
    res.redirect(`/admin/products/${req.params.id}/edit?error=${encodeURIComponent(err.message)}`);
  }
});

// POST /admin/products/:id/delete — Permanently delete a product
router.post('/:id/delete', async (req, res) => {
  try {
    const doc = await db.collection('products').doc(req.params.id).get();
    if (!doc.exists) {
      return res.redirect('/admin/products?error=Sản phẩm không tồn tại.');
    }
    const productData = doc.data();
    await db.collection('products').doc(req.params.id).delete();
    await logAdminAction(req, 'DELETE_PRODUCT', req.params.id, 'product', {
      title: productData.title,
      sellerId: productData.sellerId,
    });
    res.redirect('/admin/products?success=Đã xóa sản phẩm thành công.');
  } catch (err) {
    res.redirect(`/admin/products?error=${encodeURIComponent(err.message)}`);
  }
});

module.exports = router;
