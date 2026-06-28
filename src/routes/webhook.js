const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const db = require('../config/firebase');

// Webhook for Sepay (Bank Transfer)
// Endpoint: POST /webhook/sepay
router.post('/sepay', async (req, res) => {
  const payload = req.body;
  console.log('--- NHẬN WEBHOOK SEPAY ---');
  console.log('Headers:', req.headers);
  console.log('Payload:', payload);

  // 1. Authenticate Request via HMAC-SHA256
  const webhookSecret = process.env.SEPAY_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.warn('⚠️ WARNING: SEPAY_WEBHOOK_SECRET is not configured. Bypassing signature check for testing.');
  } else {
    const signature = req.headers['x-sepay-signature'] || req.headers['X-SePay-Signature'] || '';
    const timestamp = Number(req.headers['x-sepay-timestamp'] || req.headers['X-SePay-Timestamp'] || 0);

    // Replay attack prevention: reject requests older/newer than 5 minutes (300 seconds)
    if (Math.abs(Date.now() / 1000 - timestamp) > 300) {
      console.error('❌ SePay Webhook: Request expired (timestamp difference > 300s).');
      return res.status(401).json({ success: false, message: 'Request expired' });
    }

    const rawBodyStr = req.rawBody || JSON.stringify(req.body);
    const expectedSignature = 'sha256=' + crypto
      .createHmac('sha256', webhookSecret)
      .update(`${timestamp}.${rawBodyStr}`)
      .digest('hex');

    const sigBuffer = Buffer.from(signature);
    const expBuffer = Buffer.from(expectedSignature);

    if (sigBuffer.length !== expBuffer.length || !crypto.timingSafeEqual(sigBuffer, expBuffer)) {
      console.error('❌ SePay Webhook: Invalid signature.');
      return res.status(401).json({ success: false, message: 'Invalid signature' });
    }
    console.log('✅ SePay Webhook HMAC-SHA256 Signature verified successfully.');
  }

  // 2. Parse payload safely
  const transferContent = (payload.content || payload.transferContent || '').toString().trim();
  const transferAmount = parseFloat(payload.transferAmount || payload.amount || 0);
  const transferType = (payload.transferType || 'in').toString().toLowerCase();
  const referenceCode = payload.referenceCode || payload.id || `SP_${Date.now()}`;
  const transactionId = payload.id ? payload.id.toString() : `SP_${Date.now()}`;

  if (transferType !== 'in') {
    console.log(`Bỏ qua giao dịch chuyển tiền ra (transferType: ${transferType})`);
    return res.status(200).json({ success: true, message: 'Ignored - not a credit transaction' });
  }

  if (!transferContent || transferAmount <= 0) {
    return res.status(400).json({ success: false, message: 'Invalid transaction content or amount' });
  }

  try {
    // 3. Check if transaction was already processed (either via transactions referenceCode or topup_requests id/referenceCode)
    const txCheck = await db.collection('transactions').where('referenceCode', '==', referenceCode).get();
    if (!txCheck.empty) {
      console.log('Giao dịch đã được xử lý trước đó.');
      return res.status(200).json({ success: true, message: 'Already processed' });
    }

    // 4. Extract User ID (match 'NAP' code)
    const match = transferContent.toUpperCase().match(/NAP\s+([A-Z0-9]+)/i);
    if (!match) {
      console.log('Nội dung chuyển khoản không hợp lệ (không chứa cú pháp NAP):', transferContent);
      return res.status(200).json({ success: true, message: 'Ignored - invalid content format' });
    }

    const extractedCode = match[1].toUpperCase();

    // 5. Find the user (O(1) exact match, fallback to prefix scan)
    let targetUserDoc = await db.collection('users').doc(extractedCode).get();
    let targetUserId = null;
    let targetUserData = null;

    if (targetUserDoc.exists) {
      targetUserId = targetUserDoc.id;
      targetUserData = targetUserDoc.data();
      console.log(`Tìm thấy user bằng ID chính xác: ${targetUserId}`);
    } else {
      console.log(`Không tìm thấy user bằng ID chính xác, thử tìm bằng tiền tố: ${extractedCode}`);
      const usersSnapshot = await db.collection('users').get();
      usersSnapshot.docs.forEach(doc => {
        if (doc.id.toUpperCase().startsWith(extractedCode)) {
          targetUserDoc = doc;
          targetUserId = doc.id;
          targetUserData = doc.data();
        }
      });
    }

    if (!targetUserId) {
      console.log('Không tìm thấy User nào khớp với mã:', extractedCode);
      return res.status(200).json({ success: true, message: 'User not found' });
    }

    // 6. Update user balance
    const amount = Math.floor(transferAmount / 1000);
    const balanceBefore = targetUserData.balance || targetUserData.walletBalance || 0;
    const balanceAfter = balanceBefore + amount;

    await db.collection('users').doc(targetUserId).set({
      balance: balanceAfter,
      walletBalance: balanceAfter
    }, { merge: true });

    // 7. Add Transaction History (User profile history)
    await db.collection('transactions').add({
      userId: targetUserId,
      type: 'TOPUP',
      amount: amount,
      status: 'COMPLETED',
      description: `Nạp zCoin qua Chuyển khoản ngân hàng (SePay: ${referenceCode}, Số tiền: ${transferAmount?.toLocaleString('vi-VN')}đ)`,
      referenceCode: referenceCode,
      createdAt: new Date().toISOString()
    });

    // 8. Add Wallet Transactions Log (Admin audit history)
    await db.collection('wallet_transactions').add({
      userId: targetUserId,
      amount: amount,
      type: 'credit',
      balanceBefore,
      balanceAfter,
      adminId: 'sepay-webhook',
      adminEmail: 'sepay-webhook',
      reason: `Nạp zCoin tự động qua Webhook SePay (Giao dịch: ${referenceCode}, Số tiền: ${transferAmount?.toLocaleString('vi-VN')}đ)`,
      timestamp: new Date().toISOString()
    });

    // 9. Add Topup Request (Status APPROVED for Admin panel and statistics charts)
    await db.collection('topup_requests').doc(transactionId).set({
      userId: targetUserId,
      username: targetUserData.username || 'User',
      amount: amount,
      method: 'bank',
      status: 'approved',
      approvedBy: 'sepay-webhook',
      approvedAt: new Date().toISOString(),
      referenceCode: referenceCode,
      createdAt: new Date().toISOString(),
      timestamp: new Date().toISOString(),
      approvalNote: `Nạp zCoin tự động SePay Webhook (Số tiền: ${transferAmount?.toLocaleString('vi-VN')}đ)`
    });

    console.log(`✔ Nạp thành công ${amount} zCoin cho user ${targetUserData.username || targetUserId}`);
    return res.status(200).json({ success: true, message: 'Success' });

  } catch (error) {
    console.error('❌ Webhook processing error:', error);
    return res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
});

module.exports = router;
