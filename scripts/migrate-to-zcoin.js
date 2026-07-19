const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const db = require('../src/config/firebase');

async function migrate() {
  console.log('🚀 Starting database migration to zCoin...');
  
  if (db.isMock) {
    console.log('⚠️ Running in MOCK mode. Writing updates to in-memory store.');
  } else {
    console.log('✔ Connected to live Firebase Firestore.');
  }

  // 1. Migrate Users balance
  console.log('\n👤 Migrating users balance (VND -> zCoin)...');
  const usersSnapshot = await db.collection('users').get();
  let userCount = 0;
  for (const doc of usersSnapshot.docs) {
    const data = doc.data();
    const currentBalance = data.balance || 0;
    // Divide balance by 1000 to convert to zCoin
    const newBalance = Math.round(currentBalance / 1000);
    console.log(`- User: ${data.username || data.email || doc.id} | Balance: ${currentBalance} VND -> ${newBalance} zCoin`);
    await db.collection('users').doc(doc.id).update({
      balance: newBalance
    });
    userCount++;
  }
  console.log(`✅ Migrated ${userCount} users.`);

  // 2. Migrate Products priceNumber & salePrice / originalPrice
  console.log('\n📦 Migrating products prices (VND -> zCoin)...');
  const productsSnapshot = await db.collection('products').get();
  let productCount = 0;
  for (const doc of productsSnapshot.docs) {
    const data = doc.data();
    
    let newPrice = 0;
    if (typeof data.priceNumber === 'number') {
      // If it's already a small number (under 100000), it might already be in zCoin
      if (data.priceNumber > 1000) {
        newPrice = Math.round(data.priceNumber / 1000);
      } else {
        newPrice = data.priceNumber;
      }
    } else if (typeof data.price === 'number') {
      if (data.price > 1000) {
        newPrice = Math.round(data.price / 1000);
      } else {
        newPrice = data.price;
      }
    } else if (data.salePrice && typeof data.salePrice === 'string') {
      const match = data.salePrice.replace(/\./g, '').match(/\d+/);
      if (match) {
        const val = parseInt(match[0]);
        if (val > 1000) {
          newPrice = Math.round(val / 1000);
        } else {
          newPrice = val;
        }
      }
    }
    
    // Parse original price
    let newOriginalPriceStr = 'Free';
    if (data.originalPrice && data.originalPrice !== 'Free') {
      const match = data.originalPrice.replace(/\./g, '').match(/\d+/);
      if (match) {
        const val = parseInt(match[0]);
        const newOrigPrice = val > 1000 ? Math.round(val / 1000) : val;
        newOriginalPriceStr = `${newOrigPrice} zCoin`;
      }
    }
    
    const newSalePriceStr = `${newPrice} zCoin`;
    
    console.log(`- Product: ${data.title} | Price: ${data.priceNumber || data.price || data.salePrice} -> ${newPrice} zCoin`);
    
    const updates = {
      priceNumber: newPrice,
      salePrice: newSalePriceStr,
      originalPrice: newOriginalPriceStr
    };
    if (typeof data.price === 'number' || data.price !== undefined) {
      updates.price = newPrice;
    }
    
    await db.collection('products').doc(doc.id).update(updates);
    productCount++;
  }
  console.log(`✅ Migrated ${productCount} products.`);

  // 3. Migrate Wallet Transactions amounts
  console.log('\n💳 Migrating transactions amounts (VND -> zCoin)...');
  const txSnapshot = await db.collection('wallet_transactions').get();
  let txCount = 0;
  for (const doc of txSnapshot.docs) {
    const data = doc.data();
    const currentAmount = data.amount || 0;
    const newAmount = Math.round(currentAmount / 1000);
    console.log(`- Transaction: #${doc.id.slice(-8)} | Amount: ${currentAmount} VND -> ${newAmount} zCoin`);
    await db.collection('wallet_transactions').doc(doc.id).update({
      amount: newAmount
    });
    txCount++;
  }
  console.log(`✅ Migrated ${txCount} transactions.`);
  
  console.log('\n🎉 Migration completed successfully!');
}

migrate().catch(err => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
