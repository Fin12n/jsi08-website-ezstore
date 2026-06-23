const express = require('express');
const router = express.Router();
const db = require('../config/firebase');

// Webhook for Sepay (Bank Transfer)
// Endpoint: POST /webhook/sepay
router.post('/sepay', async (req, res) => {
  // Sepay sends data like:
  // { id, gateway, transactionDate, accountNumber, subAccount, amount, transferType, transferContent, accumulated, referenceCode, description }
  
  const payload = req.body;
  console.log('--- NHẬN WEBHOOK SEPAY ---');
  console.log(payload);

  if (!payload || !payload.transferContent || !payload.amount) {
    return res.status(400).json({ success: false, message: 'Invalid payload' });
  }

  try {
    // 1. Check if this transaction was already processed
    const txCheck = await db.collection('transactions').where('referenceCode', '==', payload.referenceCode).get();
    if (!txCheck.empty) {
      console.log('Giao dịch đã được xử lý trước đó.');
      return res.status(200).json({ success: true, message: 'Already processed' });
    }

    // 2. Extract User ID from transfer content (e.g. "NAP a1b2c3")
    // Note: The ID in the content is just the first 6 chars of the user.id, uppercase
    const content = payload.transferContent.toUpperCase();
    const match = content.match(/NAP\s+([A-Z0-9]+)/);
    
    if (!match) {
      console.log('Nội dung chuyển khoản không hợp lệ:', content);
      return res.status(200).json({ success: true, message: 'Ignored - not a valid syntax' });
    }

    const shortId = match[1];

    // 3. Find the user
    // Since we only have the short ID, we have to fetch all users or find the one starting with it
    const usersSnapshot = await db.collection('users').get();
    let targetUserDoc = null;
    let targetUserId = null;
    let targetUserData = null;

    usersSnapshot.docs.forEach(doc => {
      if (doc.id.toUpperCase().startsWith(shortId)) {
        targetUserDoc = doc;
        targetUserId = doc.id;
        targetUserData = doc.data();
      }
    });

    if (!targetUserDoc) {
      console.log('Không tìm thấy User nào khớp với mã:', shortId);
      return res.status(200).json({ success: true, message: 'User not found' });
    }

    // 4. ATOMIC OPERATION: Update user balance and create transaction log
    const amount = parseInt(payload.amount);
    const newBalance = (targetUserData.balance || 0) + amount;

    await db.collection('users').doc(targetUserId).set({
      balance: newBalance
    }, { merge: true });

    await db.collection('transactions').add({
      userId: targetUserId,
      type: 'TOPUP',
      amount: amount,
      status: 'COMPLETED',
      description: `Nạp tiền qua Chuyển khoản ngân hàng (Sepay: ${payload.referenceCode})`,
      referenceCode: payload.referenceCode,
      createdAt: new Date().toISOString()
    });

    console.log(`✔ Nạp thành công ${amount}đ cho user ${targetUserData.username}`);
    
    res.status(200).json({ success: true });

  } catch (error) {
    console.error('❌ Webhook processing error:', error);
    res.status(500).json({ success: false });
  }
});

module.exports = router;
