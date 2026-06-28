/**
 * Wallet Service — Financial Operations
 * Handles all wallet mutations: credit, debit, and atomic refund.
 * All operations write to wallet_transactions log for full audit trail.
 */
const db = require('../config/firebase');
const { logAdminAction } = require('../middlewares/audit-logger');

/**
 * Get the current wallet balance for a user.
 * @param {string} userId
 * @returns {Promise<number>} Current balance in VND (integer)
 */
async function getBalance(userId) {
  const userDoc = await db.collection('users').doc(userId).get();
  if (!userDoc.exists) throw new Error(`User ${userId} not found`);
  const data = userDoc.data();
  return typeof data.walletBalance === 'number' ? data.walletBalance : 0;
}

/**
 * Record a wallet transaction to the wallet_transactions collection.
 * @private
 */
async function _recordTransaction({ userId, amount, type, balanceBefore, balanceAfter, adminId, adminEmail, reason, orderId }) {
  try {
    await db.collection('wallet_transactions').add({
      userId,
      amount,
      type, // 'credit' | 'debit' | 'refund-in' | 'refund-out' | 'manual-adjust'
      balanceBefore,
      balanceAfter,
      adminId: adminId || 'system',
      adminEmail: adminEmail || 'system',
      reason: reason || null,
      orderId: orderId || null,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[WALLET] Failed to record transaction log:', err.message);
    // Don't throw — transaction log failure should not rollback the balance change
  }
}

/**
 * Credit (add) funds to a user's wallet.
 * Used for: manual top-up approval, admin bonus.
 *
 * @param {Object} opts
 * @param {string}  opts.userId      - Target user ID
 * @param {number}  opts.amount      - Amount in VND (must be positive integer)
 * @param {string}  opts.reason      - Reason for the credit (required for audit)
 * @param {Object}  opts.adminInfo   - { id, email } of the performing admin
 * @param {Object}  [opts.req]       - Express request object (for audit logging)
 * @returns {Promise<{balanceBefore, balanceAfter}>}
 */
async function creditWallet({ userId, amount, reason, adminInfo = {}, req = null }) {
  if (!userId) throw new Error('userId is required');
  if (!amount || amount <= 0) throw new Error('Amount must be a positive number');

  const balanceBefore = await getBalance(userId);
  const balanceAfter = balanceBefore + Math.floor(amount);

  await db.collection('users').doc(userId).set(
    { 
      walletBalance: balanceAfter,
      balance: balanceAfter
    },
    { merge: true }
  );

  await _recordTransaction({
    userId, amount, type: 'credit',
    balanceBefore, balanceAfter,
    adminId: adminInfo.id, adminEmail: adminInfo.email,
    reason,
  });

  if (req) {
    await logAdminAction(req, 'WALLET_CREDIT', userId, 'user', {
      amount, balanceBefore, balanceAfter, reason,
    });
  }

  return { balanceBefore, balanceAfter };
}

/**
 * Debit (subtract) funds from a user's wallet.
 * Used for: admin penalty, commission deduction.
 *
 * @param {Object} opts
 * @param {string}  opts.userId      - Target user ID
 * @param {number}  opts.amount      - Amount in VND (must be positive integer)
 * @param {string}  opts.reason      - Reason for the debit
 * @param {Object}  opts.adminInfo   - { id, email }
 * @param {Object}  [opts.req]       - Express request object
 * @returns {Promise<{balanceBefore, balanceAfter}>}
 */
async function debitWallet({ userId, amount, reason, adminInfo = {}, req = null }) {
  if (!userId) throw new Error('userId is required');
  if (!amount || amount <= 0) throw new Error('Amount must be a positive number');

  const balanceBefore = await getBalance(userId);
  if (balanceBefore < amount) {
    throw new Error(`Insufficient balance. Current: ${balanceBefore.toLocaleString('vi-VN')}đ, Required: ${amount.toLocaleString('vi-VN')}đ`);
  }

  const balanceAfter = balanceBefore - Math.floor(amount);

  await db.collection('users').doc(userId).set(
    { 
      walletBalance: balanceAfter,
      balance: balanceAfter
    },
    { merge: true }
  );

  await _recordTransaction({
    userId, amount, type: 'debit',
    balanceBefore, balanceAfter,
    adminId: adminInfo.id, adminEmail: adminInfo.email,
    reason,
  });

  if (req) {
    await logAdminAction(req, 'WALLET_DEBIT', userId, 'user', {
      amount, balanceBefore, balanceAfter, reason,
    });
  }

  return { balanceBefore, balanceAfter };
}

/**
 * Atomic Refund — deducts from Seller wallet and credits Buyer wallet atomically.
 * Uses Firestore runTransaction to ensure consistency.
 * Falls back to sequential ops in mock mode (db.isMock === true).
 *
 * @param {Object} opts
 * @param {string} opts.buyerId      - Buyer's user ID
 * @param {string} opts.sellerId     - Seller's user ID
 * @param {number} opts.amount       - Refund amount in VND
 * @param {string} opts.orderId      - The order being refunded
 * @param {string} opts.reason       - Refund reason (from admin action)
 * @param {Object} opts.adminInfo    - { id, email }
 * @param {Object} [opts.req]        - Express request object
 * @returns {Promise<{buyerNewBalance, sellerNewBalance}>}
 */
async function atomicRefund({ buyerId, sellerId, amount, orderId, reason, adminInfo = {}, req = null }) {
  if (!buyerId || !sellerId) throw new Error('buyerId and sellerId are required');
  if (!amount || amount <= 0) throw new Error('Refund amount must be positive');
  if (!orderId) throw new Error('orderId is required for refund');

  let buyerNewBalance, sellerNewBalance;

  if (db.isMock) {
    // Mock fallback: sequential operations (not truly atomic but acceptable for dev)
    console.warn('[WALLET] Running in MOCK mode — atomicRefund is NOT truly atomic');
    const buyerBefore = await getBalance(buyerId);
    const sellerBefore = await getBalance(sellerId);

    buyerNewBalance = buyerBefore + Math.floor(amount);
    sellerNewBalance = Math.max(0, sellerBefore - Math.floor(amount));

    await db.collection('users').doc(buyerId).set({ walletBalance: buyerNewBalance, balance: buyerNewBalance }, { merge: true });
    await db.collection('users').doc(sellerId).set({ walletBalance: sellerNewBalance, balance: sellerNewBalance }, { merge: true });
    await db.collection('orders').doc(orderId).set({ refundStatus: 'approved', downloadRevoked: true }, { merge: true });
  } else {
    // Real Firestore: use runTransaction for atomicity
    const { getFirestore } = require('firebase-admin/firestore');
    const firestore = getFirestore();

    await firestore.runTransaction(async (transaction) => {
      const buyerRef = firestore.collection('users').doc(buyerId);
      const sellerRef = firestore.collection('users').doc(sellerId);
      const orderRef = firestore.collection('orders').doc(orderId);

      const [buyerSnap, sellerSnap] = await Promise.all([
        transaction.get(buyerRef),
        transaction.get(sellerRef),
      ]);

      const buyerBalance = buyerSnap.exists ? (buyerSnap.data().walletBalance || 0) : 0;
      const sellerBalance = sellerSnap.exists ? (sellerSnap.data().walletBalance || 0) : 0;

      buyerNewBalance = buyerBalance + Math.floor(amount);
      sellerNewBalance = Math.max(0, sellerBalance - Math.floor(amount));

      transaction.set(buyerRef, { walletBalance: buyerNewBalance, balance: buyerNewBalance }, { merge: true });
      transaction.set(sellerRef, { walletBalance: sellerNewBalance, balance: sellerNewBalance }, { merge: true });
      transaction.set(orderRef, { refundStatus: 'approved', downloadRevoked: true }, { merge: true });
    });
  }

  // Log both sides of the transaction
  const sharedDetails = { amount, orderId, reason };
  await Promise.all([
    _recordTransaction({ userId: buyerId, amount, type: 'refund-in', balanceBefore: null, balanceAfter: buyerNewBalance, adminId: adminInfo.id, adminEmail: adminInfo.email, reason, orderId }),
    _recordTransaction({ userId: sellerId, amount, type: 'refund-out', balanceBefore: null, balanceAfter: sellerNewBalance, adminId: adminInfo.id, adminEmail: adminInfo.email, reason, orderId }),
  ]);

  if (req) {
    await logAdminAction(req, 'REFUND_APPROVED', orderId, 'order', {
      buyerId, sellerId, amount, buyerNewBalance, sellerNewBalance, reason,
    });
  }

  return { buyerNewBalance, sellerNewBalance };
}

module.exports = { getBalance, creditWallet, debitWallet, atomicRefund };
