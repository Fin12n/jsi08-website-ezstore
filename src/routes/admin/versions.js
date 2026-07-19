const express = require('express');
const router = express.Router();
const db = require('../../config/firebase');
const r2 = require('../../config/r2');
const { logAdminAction } = require('../../middlewares/audit-logger');

const multer = require('multer');
const fs = require('fs');
const path = require('path');

const localVersionsStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = process.env.VERCEL
      ? '/tmp/uploads/versions'
      : path.join(__dirname, '../../public/uploads/versions');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, `ver-${uniqueSuffix}${ext}`);
  }
});
const localVersionsUpload = multer({ 
  storage: localVersionsStorage, 
  limits: { fileSize: 100 * 1024 * 1024 } // 100MB local upload limit
});

// POST /admin/api/versions/presign
// Generate presigned PUT URL for client-side file upload directly to R2 (bypass Vercel 4.5MB payload limit)
// FALLBACK: If R2 is not configured/active, returns local upload URL handler.
router.post('/presign', async (req, res) => {
  try {
    const { fileName, fileType, productId } = req.body;
    if (!fileName || !productId) {
      return res.status(400).json({ error: 'Thiếu tên file hoặc ID sản phẩm' });
    }

    if (!r2.isR2Active) {
      // Return a flag indicating local fallback upload endpoint
      return res.json({ 
        isLocal: true, 
        uploadUrl: `/admin/api/products/${productId}/versions/upload-local` 
      });
    }

    // Standardize file key structure
    const cleanFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
    const fileKey = `products/${productId}/${Date.now()}-${cleanFileName}`;
    
    const uploadUrl = await r2.generateUploadUrl(fileKey, fileType || 'application/octet-stream');
    res.json({ uploadUrl, fileKey });
  } catch (error) {
    console.error('Error generating presigned PUT URL:', error);
    res.status(500).json({ error: 'Lỗi hệ thống khi sinh URL tải lên' });
  }
});

// POST /admin/api/products/:id/versions/upload-local
// Fallback local file uploader when Cloudflare R2 is disabled
router.post('/products/:id/versions/upload-local', localVersionsUpload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Không nhận được tệp tin tải lên' });
    }
    const fileKey = `/uploads/versions/${req.file.filename}`;
    res.json({
      fileKey,
      fileName: req.file.originalname,
      fileSize: req.file.size
    });
  } catch (err) {
    console.error('Error saving local version file:', err);
    res.status(500).json({ error: 'Lỗi hệ thống khi lưu tệp tin cục bộ' });
  }
});

// POST /admin/api/products/:id/versions
// Add new version to a product's versions array in Firestore
router.post('/products/:id/versions', async (req, res) => {
  try {
    const productId = req.params.id;
    const { version, changelog, fileKey, fileName, fileSize } = req.body;

    if (!version || !fileKey || !fileName) {
      return res.status(400).json({ error: 'Vui lòng cung cấp đầy đủ: Số phiên bản, File và Tên file' });
    }

    const prodRef = db.collection('products').doc(productId);
    const prodDoc = await prodRef.get();
    if (!prodDoc.exists) {
      return res.status(404).json({ error: 'Sản phẩm không tồn tại' });
    }

    const newVersion = {
      version: version.trim(),
      changelog: (changelog || '').trim(),
      fileKey: fileKey.trim(),
      fileName: fileName.trim(),
      fileSize: Number(fileSize) || 0,
      uploadedAt: new Date().toISOString()
    };

    await prodRef.update({
      versions: db.FieldValue.arrayUnion(newVersion)
    });

    await logAdminAction(req, 'ADD_PRODUCT_VERSION', productId, 'product', { version: newVersion.version, fileName: newVersion.fileName });
    res.json({ success: true, version: newVersion });
  } catch (error) {
    console.error('Error adding version to product:', error);
    res.status(500).json({ error: 'Lỗi hệ thống khi thêm phiên bản' });
  }
});

// POST /admin/api/products/:id/versions/delete
// Remove a version from a product and delete the file from R2
router.post('/products/:id/versions/delete', async (req, res) => {
  try {
    const productId = req.params.id;
    const { fileKey, version } = req.body;

    if (!fileKey || !version) {
      return res.status(400).json({ error: 'Thiếu fileKey hoặc số phiên bản để xóa' });
    }

    const prodRef = db.collection('products').doc(productId);
    const prodDoc = await prodRef.get();
    if (!prodDoc.exists) {
      return res.status(404).json({ error: 'Sản phẩm không tồn tại' });
    }

    const prodData = prodDoc.data();
    const versions = prodData.versions || [];
    
    // Find the version object to delete
    const versionObj = versions.find(v => v.fileKey === fileKey && v.version === version);
    if (!versionObj) {
      return res.status(404).json({ error: 'Không tìm thấy thông tin phiên bản này trong database' });
    }

    // 1. Delete file (from Cloudflare R2 or local disk storage)
    if (fileKey.startsWith('/uploads/')) {
      const absolutePath = process.env.VERCEL
        ? path.join('/tmp', fileKey)
        : path.join(__dirname, '../../public', fileKey);
      if (fs.existsSync(absolutePath)) {
        fs.unlinkSync(absolutePath);
        console.log(`✔ Deleted local version file: ${absolutePath}`);
      }
    } else {
      await r2.deleteFile(fileKey);
    }

    // 2. Remove version object from Firestore array
    await prodRef.update({
      versions: db.FieldValue.arrayRemove(versionObj)
    });

    await logAdminAction(req, 'DELETE_PRODUCT_VERSION', productId, 'product', { version: versionObj.version, fileName: versionObj.fileName });
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting product version:', error);
    res.status(500).json({ error: 'Lỗi hệ thống khi xóa phiên bản' });
  }
});

module.exports = router;
