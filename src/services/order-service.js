const db = require('../config/firebase');

/**
 * Completes an order by delivering items to the buyer's library,
 * updating product sales counts, and crediting the respective sellers.
 * 
 * @param {string} orderId 
 * @returns {Promise<Object>} The updated order data
 */
async function completeOrder(orderId) {
  const orderRef = db.collection('orders').doc(orderId);
  const orderDoc = await orderRef.get();
  if (!orderDoc.exists) throw new Error(`Order ${orderId} not found`);
  const order = orderDoc.data();

  if (order.status === 'completed') {
    console.log(`Order ${orderId} is already completed.`);
    return { id: orderId, ...order };
  }

  // 1. Retrieve general settings for commission rates
  const settingsDoc = await db.collection('settings').doc('general').get();
  const settingsData = settingsDoc.exists ? settingsDoc.data() : {};
  const commissionRates = settingsData.commissionRates || { standard: 10, premium: 8, elite: 5 };

  // 2. Deliver each item in the order
  for (const item of order.items || []) {
    // A. Add to Buyer's Library
    await db.collection('library').add({
      userId: order.userId,
      productId: item.docId,
      productTitle: item.title,
      productImage: item.image,
      purchasedAt: new Date().toISOString()
    });

    // B. Increment product sales count
    const prodRef = db.collection('products').doc(item.docId);
    const prodDoc = await prodRef.get();
    if (prodDoc.exists) {
      await prodRef.set({ sales: (prodDoc.data().sales || 0) + 1 }, { merge: true });
    }

    // C. Record PURCHASE transaction for Buyer
    await db.collection('transactions').add({
      userId: order.userId,
      type: 'PURCHASE',
      amount: -item.priceNumber,
      status: 'COMPLETED',
      description: `Mua sản phẩm: ${item.title}`,
      createdAt: new Date().toISOString()
    });

    // D. Credit Seller balance and record EARN transaction
    if (item.sellerId && item.sellerId !== order.userId) {
      const sellerRef = db.collection('users').doc(item.sellerId);
      const sellerDoc = await sellerRef.get();
      if (sellerDoc.exists) {
        const sellerData = sellerDoc.data();
        const sellerRank = sellerData.rank || 'standard';
        const ratePercent = commissionRates[sellerRank] !== undefined ? commissionRates[sellerRank] : 10;
        const rateDecimal = ratePercent / 100;
        const sellerEarned = Math.floor(item.priceNumber * (1 - rateDecimal));

        await sellerRef.set({
          balance: (sellerData.balance || 0) + sellerEarned,
          walletBalance: (sellerData.walletBalance || 0) + sellerEarned
        }, { merge: true });

        await db.collection('transactions').add({
          userId: item.sellerId,
          type: 'EARN',
          amount: sellerEarned,
          status: 'COMPLETED',
          description: `Bán sản phẩm: ${item.title} (-${ratePercent}% phí)`,
          createdAt: new Date().toISOString()
        });
      }
    }
  }

  // 3. Mark the order as completed
  await orderRef.set({
    status: 'completed',
    completedAt: new Date().toISOString()
  }, { merge: true });

  console.log(`Order ${orderId} successfully completed and products delivered.`);
  return { id: orderId, ...order, status: 'completed' };
}

module.exports = { completeOrder };
