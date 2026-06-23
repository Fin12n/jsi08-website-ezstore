const express = require('express');
const router = express.Router();
const db = require('../config/firebase');

// Mock Data for Services (Still static or fallback)
const services = [
  {
    id: 1,
    title: 'Server Setup',
    description: 'Thiết lập server Minecraft chuyên nghiệp từ A-Z (Survival, Skyblock, Lifesteal, Bedwars) tối ưu hiệu năng tốt nhất.',
    icon: 'fa-solid fa-server'
  },
  {
    id: 2,
    title: 'Custom Models',
    description: 'Thiết kế và cài đặt Item/Armor/Weapon 3D độc quyền (ItemsAdder, Oraxen, MythicMobs) tăng độ hấp dẫn cho server.',
    icon: 'fa-solid fa-wand-magic-sparkles'
  },
  {
    id: 3,
    title: 'Optimization & Security',
    description: 'Tối ưu hóa TPS, chống lag, hạn chế crash, thiết lập tường lửa và hệ thống bảo mật chống DDoS chuyên sâu.',
    icon: 'fa-solid fa-shield-halved'
  }
];

// Helper: Query all products from Firestore
async function getAllProducts() {
  try {
    const snapshot = await db.collection('products').get();
    const list = [];
    snapshot.docs.forEach(doc => {
      // Include document ID as 'docId' and preserve original id
      const data = doc.data();
      list.push({ 
        docId: doc.id,
        id: data.id || doc.id, 
        ...data 
      });
    });
    return list;
  } catch (error) {
    console.error('❌ Error fetching products from Firestore:', error);
    return [];
  }
}

// Helper: Query all categories from Firestore
async function getAllCategories() {
  try {
    const snapshot = await db.collection('categories').orderBy('createdAt', 'asc').get();
    const list = [];
    snapshot.docs.forEach(doc => list.push({ id: doc.id, ...doc.data() }));
    return list;
  } catch (error) {
    console.error('❌ Error fetching categories:', error);
    return [];
  }
}

// Helper: Categorize products dynamically
function groupProducts(list, categories) {
  const grouped = [];
  categories.forEach(cat => {
    grouped.push({
      category: cat,
      products: list.filter(p => p.category === cat.slug)
    });
  });
  
  const uncategorized = list.filter(p => !categories.find(c => c.slug === p.category));
  if (uncategorized.length > 0) {
    grouped.push({
      category: { slug: 'other', name: 'Sản phẩm khác', description: '' },
      products: uncategorized
    });
  }
  return grouped;
}

// GET Homepage (Landing Page)
router.get('/', async (req, res) => {
  const [list, categories] = await Promise.all([getAllProducts(), getAllCategories()]);
  const grouped = groupProducts(list, categories);
  
  // Featured products: first of each category
  const featuredProducts = [];
  grouped.forEach(g => {
    if (g.products.length > 0) featuredProducts.push(g.products[0]);
  });

  res.render('index', { 
    title: 'EZ Studio - Minecraft Resources & Setups',
    products: featuredProducts,
    categories: categories,
    services: services
  });
});

// GET Products catalog
router.get('/products', async (req, res) => {
  const [list, categories] = await Promise.all([getAllProducts(), getAllCategories()]);
  const grouped = groupProducts(list, categories);
  res.render('products', { 
    title: 'Sản phẩm - EZ Studio',
    groupedProducts: grouped,
    categories: categories
  });
});

// GET Product Detail dynamic route
router.get('/product/:id', async (req, res) => {
  const productId = req.params.id;
  try {
    const list = await getAllProducts();
    // Try matching by id or docId or normalized string
    const product = list.find(p => 
      p.id === productId || 
      p.docId === productId || 
      p.id.replace('-set', '') === productId.replace('-set', '')
    );

    if (product) {
      res.render('product-detail', {
        title: `${product.title} - EZ Studio`,
        product: product
      });
    } else {
      res.status(404).render('404', { title: '404 - Not Found' });
    }
  } catch (error) {
    console.error(`❌ Error retrieving product detail for ${productId}:`, error);
    res.status(500).send('Internal Server Error');
  }
});

// GET Services page
router.get('/services', (req, res) => {
  res.render('services', { 
    title: 'Dịch vụ - EZ Studio',
    services: services 
  });
});

// --- CART ROUTES ---
router.get('/cart', (req, res) => {
  let total = 0;
  if (req.session.cart) {
    req.session.cart.forEach(item => {
      if (item && item.price !== undefined && item.price !== null) {
        let priceStr = item.price.toString().replace(/[^\d]/g, '');
        if (priceStr) {
          total += parseInt(priceStr, 10);
        }
      }
    });
  }
  res.render('cart', {
    title: 'Giỏ hàng - EZ Studio',
    total: total
  });
});

router.post('/cart/add', async (req, res) => {
  const { productId } = req.body;
  if (!productId) return res.redirect('/products');
  
  const list = await getAllProducts();
  const product = list.find(p => p.id === productId || p.docId === productId);
  
  if (product) {
    if (!req.session.cart) req.session.cart = [];
    const exists = req.session.cart.find(item => item.id === product.id);
    if (!exists) {
      req.session.cart.push({
        id: product.id,
        docId: product.docId,
        title: product.title,
        price: product.salePrice || product.originalPrice || product.price || (product.priceNumber ? product.priceNumber.toString() : '0'),
        image: product.image
      });
    }
  }
  
  if (req.query.checkout) {
    return res.redirect('/cart');
  }
  res.redirect(req.get('referer') || '/products');
});

router.post('/cart/remove', (req, res) => {
  const { productId } = req.body;
  if (req.session.cart) {
    req.session.cart = req.session.cart.filter(item => item.id !== productId);
  }
  res.redirect('/cart');
});

// POST Checkout (Atomic Wallet Deduction)
router.post('/checkout', async (req, res) => {
  if (!req.session.user) {
    return res.redirect('/login?redirect=/cart');
  }

  if (!req.session.cart || req.session.cart.length === 0) {
    return res.redirect('/cart?error=Giỏ hàng trống');
  }

  try {
    const userRef = db.collection('users').doc(req.session.user.id);
    const userDoc = await userRef.get();
    const userData = userDoc.data();
    
    // Parse cart items and calculate total numeric price
    let total = 0;
    const itemsToBuy = [];
    const productsSnapshot = await db.collection('products').get();
    
    req.session.cart.forEach(cartItem => {
      // Find actual product to get priceNumber and sellerId
      const realProdDoc = productsSnapshot.docs.find(d => d.id === cartItem.docId || d.data().id === cartItem.id);
      if (realProdDoc) {
        const prodData = realProdDoc.data();
        total += (prodData.priceNumber || 0);
        itemsToBuy.push({
          docId: realProdDoc.id,
          id: prodData.id,
          title: prodData.title,
          priceNumber: prodData.priceNumber || 0,
          sellerId: prodData.sellerId || null,
          image: prodData.image
        });
      }
    });

    if ((userData.balance || 0) < total) {
      return res.redirect('/user/topup?error=Số dư ví không đủ để thanh toán. Vui lòng nạp thêm.');
    }

    // Process Purchases (In a real DB, use transactions)
    const commissionRate = 0.20; // 20% platform fee
    
    for (const item of itemsToBuy) {
      // Add to Library
      await db.collection('library').add({
        userId: req.session.user.id,
        productId: item.docId,
        productTitle: item.title,
        productImage: item.image,
        purchasedAt: new Date().toISOString()
      });

      // Update Sales count
      const prodRef = db.collection('products').doc(item.docId);
      const prodDoc = await prodRef.get();
      if (prodDoc.exists) {
         await prodRef.set({ sales: (prodDoc.data().sales || 0) + 1 }, { merge: true });
      }

      // Record transaction for Buyer
      await db.collection('transactions').add({
        userId: req.session.user.id,
        type: 'PURCHASE',
        amount: -item.priceNumber,
        status: 'COMPLETED',
        description: `Mua sản phẩm: ${item.title}`,
        createdAt: new Date().toISOString()
      });

      // Give money to Seller
      if (item.sellerId && item.sellerId !== req.session.user.id) {
        const sellerEarned = Math.floor(item.priceNumber * (1 - commissionRate));
        
        const sellerRef = db.collection('users').doc(item.sellerId);
        const sellerDoc = await sellerRef.get();
        if (sellerDoc.exists) {
          await sellerRef.set({
            balance: (sellerDoc.data().balance || 0) + sellerEarned
          }, { merge: true });
          
          await db.collection('transactions').add({
            userId: item.sellerId,
            type: 'EARN',
            amount: sellerEarned,
            status: 'COMPLETED',
            description: `Bán sản phẩm: ${item.title} (-20% phí)`,
            createdAt: new Date().toISOString()
          });
        }
      }
    }

    // Deduct buyer balance
    await userRef.set({
      balance: userData.balance - total
    }, { merge: true });

    req.session.user.balance = userData.balance - total;
    req.session.cart = []; // Clear cart

    res.redirect('/user/library?success=Thanh toán thành công! Sản phẩm đã nằm trong thư viện của bạn.');

  } catch (error) {
    console.error('Checkout Error:', error);
    res.redirect('/cart?error=Lỗi hệ thống khi thanh toán');
  }
});

// GET Leaderboard
router.get('/leaderboard', async (req, res) => {
  try {
    const usersSnapshot = await db.collection('users').get();
    const users = [];
    usersSnapshot.docs.forEach(doc => {
      users.push({ id: doc.id, ...doc.data() });
    });

    // Sort by balance descending (simulate wealth points)
    users.sort((a, b) => (b.balance || 0) - (a.balance || 0));
    const topUsers = users.slice(0, 10); // Top 10

    res.render('leaderboard', {
      title: 'Bảng Xếp Hạng - EZ Studio',
      topUsers
    });
  } catch (error) {
    res.redirect('/?error=Lỗi tải bảng xếp hạng');
  }
});

// GET DB Seed Route
router.get('/seed', async (req, res) => {
  try {
    const bcrypt = require('bcryptjs');
    const salt = await bcrypt.genSalt(10);
    const hashPassword = await bcrypt.hash('123456', salt);

    // Seed Admin
    await db.collection('users').add({
      username: 'Admin',
      email: 'admin@ezstudio.vn',
      password: hashPassword,
      role: 'admin',
      balance: 10000000,
      createdAt: new Date().toISOString()
    });

    // Seed Seller
    await db.collection('users').add({
      username: 'Seller Pro',
      email: 'seller@ezstudio.vn',
      password: hashPassword,
      role: 'seller',
      balance: 500000,
      createdAt: new Date().toISOString()
    });

    // Seed Normal User
    await db.collection('users').add({
      username: 'Player1',
      email: 'player@ezstudio.vn',
      password: hashPassword,
      role: 'user',
      balance: 50000,
      createdAt: new Date().toISOString()
    });
    
    // Seed some categories if empty
    const catSnap = await db.collection('categories').get();
    if (catSnap.empty) {
      await db.collection('categories').add({ name: '3D Models', slug: 'models', description: 'Các mẫu 3D tùy chỉnh', createdAt: new Date().toISOString() });
      await db.collection('categories').add({ name: 'Server Maps', slug: 'maps', description: 'Bản đồ Minecraft', createdAt: new Date().toISOString() });
      await db.collection('categories').add({ name: 'File Setups', slug: 'setups', description: 'Các file cấu hình Server', createdAt: new Date().toISOString() });
    }

    res.send('<h1>✅ Database đã được Seed thành công!</h1><p><a href="/">Về Trang chủ</a> | <a href="/login">Đăng nhập</a></p><p>Tài khoản Test:<br>admin@ezstudio.vn / 123456<br>seller@ezstudio.vn / 123456<br>player@ezstudio.vn / 123456</p>');
  } catch (error) {
    res.send('Lỗi khi seed: ' + error.message);
  }
});

module.exports = router;
