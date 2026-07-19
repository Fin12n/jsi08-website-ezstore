/**
 * Admin Settings Routes (Extended)
 * Commission rates, SEO metadata, cache refresh.
 * Extends the base settings (exchange rate, bank info, banner) from original admin.js.
 */
const express = require('express');
const router = express.Router();
const db = require('../../config/firebase');
const { upload } = require('../../config/cloudinary');
const { logAdminAction } = require('../../middlewares/audit-logger');

// GET /admin/settings — Settings page (consolidates all setting sections)
router.get('/settings', async (req, res) => {
  try {
    const [settingsDoc, couponsSnap] = await Promise.all([
      db.collection('settings').doc('general').get(),
      db.collection('coupons').get(),
    ]);

    const settings = settingsDoc.exists
      ? settingsDoc.data()
      : { exchangeRate: 1, bankInfo: '', commissionRates: {}, seoMeta: {} };

    const coupons = couponsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    res.render('admin/settings', {
      title: 'Cài đặt Hệ thống - EZ Studio',
      activePage: 'settings',
      settings,
      coupons,
      success: req.query.success,
      error: req.query.error,
    });
  } catch (err) {
    res.render('admin/settings', { title: 'Cài đặt', activePage: 'settings', settings: {}, coupons: [], error: err.message });
  }
});

// POST /admin/api/settings — Update exchange rate or bank info (existing)
router.post('/api/settings', async (req, res) => {
  try {
    const { type, exchangeRate, bankName, accountName, accountNumber } = req.body;
    const docRef = db.collection('settings').doc('general');

    if (type === 'exchange') {
      await docRef.set({ exchangeRate: Number(exchangeRate) }, { merge: true });
      await logAdminAction(req, 'UPDATE_EXCHANGE_RATE', 'general', 'settings', { exchangeRate });
      res.redirect('/admin/settings?success=Cập nhật tỷ giá thành công!');
    } else if (type === 'bank') {
      await docRef.set({ bankInfo: { bankName, accountName, accountNumber } }, { merge: true });
      await logAdminAction(req, 'UPDATE_BANK_INFO', 'general', 'settings', {});
      res.redirect('/admin/settings?success=Cập nhật thông tin ngân hàng thành công!');
    } else {
      res.redirect('/admin/settings?error=Loại cài đặt không hợp lệ.');
    }
  } catch (err) {
    res.redirect(`/admin/settings?error=${err.message}`);
  }
});

// POST /admin/api/settings/banner — Upload banner image
router.post('/api/settings/banner', upload.single('banner'), async (req, res) => {
  try {
    if (!req.file) return res.redirect('/admin/settings?error=Vui lòng chọn ảnh');
    const imageUrl = req.file.path.startsWith('http') ? req.file.path : `/uploads/${req.file.filename}`;

    const docRef = db.collection('settings').doc('general');
    const current = await docRef.get();
    const existingBanners = current.exists ? (current.data().banners || []) : [];
    existingBanners.push(imageUrl);

    await docRef.set({ banners: existingBanners }, { merge: true });
    await logAdminAction(req, 'UPLOAD_BANNER', 'general', 'settings', { imageUrl });
    res.redirect('/admin/settings?success=Cập nhật banner thành công!');
  } catch (err) {
    res.redirect(`/admin/settings?error=${err.message}`);
  }
});

// POST /admin/api/settings/commission — Update commission rates by seller rank
router.post('/api/settings/commission', async (req, res) => {
  try {
    const { standardRate, premiumRate, eliteRate } = req.body;

    const commissionRates = {
      standard: parseFloat(standardRate) || 10,
      premium: parseFloat(premiumRate) || 8,
      elite: parseFloat(eliteRate) || 5,
      updatedAt: new Date().toISOString(),
    };

    await db.collection('settings').doc('general').set({ commissionRates }, { merge: true });
    await logAdminAction(req, 'UPDATE_COMMISSION_RATES', 'general', 'settings', { commissionRates });
    res.redirect('/admin/settings?success=Cập nhật tỷ lệ hoa hồng thành công!');
  } catch (err) {
    res.redirect(`/admin/settings?error=${err.message}`);
  }
});

// POST /admin/api/settings/seo — Update SEO metadata
router.post('/api/settings/seo', async (req, res) => {
  try {
    const { metaTitle, metaDescription, metaKeywords, robotsTxt } = req.body;

    const seoMeta = {
      metaTitle: metaTitle || '',
      metaDescription: metaDescription || '',
      metaKeywords: metaKeywords || '',
      robotsTxt: robotsTxt || 'User-agent: *\nAllow: /',
      updatedAt: new Date().toISOString(),
    };

    await db.collection('settings').doc('general').set({ seoMeta }, { merge: true });
    await logAdminAction(req, 'UPDATE_SEO_META', 'general', 'settings', { metaTitle });
    res.redirect('/admin/settings?success=Cập nhật SEO metadata thành công!');
  } catch (err) {
    res.redirect(`/admin/settings?error=${err.message}`);
  }
});

// POST /admin/api/settings/chatbot — Update OpenAI API Key for chatbot
router.post('/api/settings/chatbot', async (req, res) => {
  try {
    const { openaiApiKey } = req.body;
    await db.collection('settings').doc('general').set({
      chatbot: {
        openaiApiKey: openaiApiKey ? openaiApiKey.trim() : '',
        updatedAt: new Date().toISOString()
      }
    }, { merge: true });
    await logAdminAction(req, 'UPDATE_CHATBOT_API_KEY', 'general', 'settings', {});
    res.redirect('/admin/settings?success=Cập nhật API Key ChatGPT thành công!');
  } catch (err) {
    res.redirect(`/admin/settings?error=${err.message}`);
  }
});

// POST /admin/api/settings/refresh-cache — Trigger manual cache/aggregated data refresh
router.post('/api/settings/refresh-cache', async (req, res) => {
  try {
    // Update a refresh timestamp that clients can poll
    await db.collection('settings').doc('general').set({
      lastCacheRefresh: new Date().toISOString(),
      cacheRefreshedBy: req.session.user.email,
    }, { merge: true });

    await logAdminAction(req, 'REFRESH_CACHE', 'general', 'settings', {});
    res.json({ success: true, message: 'Đã kích hoạt làm mới dữ liệu thống kê.', refreshedAt: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /admin/api/coupons — Create coupon (moved from main admin.js)
router.post('/api/coupons', async (req, res) => {
  try {
    const { code, discountType, discountValue, limit, expiryDate, category } = req.body;
    const couponId = code.toUpperCase().trim();

    await db.collection('coupons').doc(couponId).set({
      code: couponId,
      discountType,
      discountValue: Number(discountValue),
      category: category || 'all',
      limit: limit ? Number(limit) : null,
      usedCount: 0,
      expiryDate: expiryDate || null,
      createdAt: new Date().toISOString(),
      createdBy: req.session.user.email,
    });

    await logAdminAction(req, 'CREATE_COUPON', couponId, 'coupon', { discountType, discountValue });
    res.redirect('/admin/settings?success=Tạo mã giảm giá thành công!');
  } catch (err) {
    res.redirect(`/admin/settings?error=${err.message}`);
  }
});

// POST /admin/api/coupons/:id/delete — Delete coupon
router.post('/api/coupons/:id/delete', async (req, res) => {
  try {
    await db.collection('coupons').doc(req.params.id).delete();
    await logAdminAction(req, 'DELETE_COUPON', req.params.id, 'coupon', {});
    res.redirect('/admin/settings?success=Đã xóa mã giảm giá!');
  } catch (err) {
    res.redirect(`/admin/settings?error=${err.message}`);
  }
});

module.exports = router;
