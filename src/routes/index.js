const express = require('express');
const router = express.Router();
const db = require('../config/firebase');
const { completeOrder } = require('../services/order-service');

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
  try {
    const [list, categories] = await Promise.all([getAllProducts(), getAllCategories()]);
    
    // Standard Minecraft major versions to show in the dropdown
    const availableVersions = ['1.20.x', '1.19.x', '1.18.x', '1.17.x', '1.16.x', '1.12.x', '1.8.x'];
    
    // Standard map size categories
    const availableSizes = [
      { value: 'under50', label: 'Dưới 50x50' },
      { value: 'under100', label: 'Dưới 100x100' },
      { value: 'under150', label: 'Dưới 150x150' },
      { value: 'under200', label: 'Dưới 200x200' },
      { value: 'under300', label: 'Dưới 300x300' },
      { value: 'above300', label: 'Trên 300x300' }
    ];

    const { q, category, price, version, size } = req.query;
    let filteredList = [...list];

    // 1. Filter by search keyword (case-insensitive & unicode normalization)
    if (q && q.trim() !== '') {
      const keyword = q.trim().toLowerCase();
      const normalize = str => str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      const normalizedKeyword = normalize(keyword);
      filteredList = filteredList.filter(p => {
        const titleMatch = p.title && normalize(p.title).includes(normalizedKeyword);
        const descMatch = p.description && normalize(p.description).includes(normalizedKeyword);
        return titleMatch || descMatch;
      });
    }

    // 2. Filter by category
    if (category && category !== '') {
      filteredList = filteredList.filter(p => p.category === category);
    }

    // 3. Filter by price
    if (price && price !== '') {
      if (price === 'free') {
        filteredList = filteredList.filter(p => p.priceNumber === 0);
      } else if (price === 'paid') {
        filteredList = filteredList.filter(p => p.priceNumber > 0);
      }
    }

    // Helper function for version compatibility check
    const isVersionCompatible = (prodVersionStr, selectedVersion) => {
      if (!prodVersionStr || !selectedVersion) return false;
      
      const clean = v => {
        const m = v.match(/^(\d+)\.(\d+)/);
        return m ? parseFloat(`${m[1]}.${m[2]}`) : null;
      };

      const selNum = clean(selectedVersion);
      if (selNum === null) return false;

      // Handle comma-separated lists or ranges
      const parts = prodVersionStr.split(',');
      for (let part of parts) {
        part = part.trim();
        if (part.includes('-')) {
          const rangeParts = part.split('-');
          const minNum = clean(rangeParts[0].trim());
          const maxNum = clean(rangeParts[1].trim());
          if (minNum !== null && maxNum !== null) {
            if (selNum >= minNum && selNum <= maxNum) return true;
          }
        } else {
          const pNum = clean(part);
          if (pNum !== null && pNum === selNum) return true;
        }
      }
      
      const cleanSel = selectedVersion.replace('.x', '').replace('x', '');
      return prodVersionStr.toLowerCase().includes(cleanSel.toLowerCase());
    };

    // 4. Filter by version (checking custom fields Versions/version and product versions array)
    if (version && version !== '') {
      filteredList = filteredList.filter(p => {
        const prodVersionStr = p.customFields && (
          p.customFields.Versions || p.customFields.versions || p.customFields.Version || p.customFields.version
        );
        const hasVerInFields = isVersionCompatible(String(prodVersionStr || ''), version);
        
        const hasVerInList = p.versions && p.versions.some(v => 
          v.version && isVersionCompatible(String(v.version), version)
        );
        
        return hasVerInFields || hasVerInList;
      });
    }

    // Helper function for map size matching
    const matchProductSize = (prodSizeStr, selectedRange) => {
      if (!prodSizeStr) return false;
      const numbers = prodSizeStr.match(/\d+/g);
      if (!numbers || numbers.length === 0) return false;
      
      const maxSize = Math.max(...numbers.map(Number));

      if (selectedRange === 'under50') return maxSize <= 50;
      if (selectedRange === 'under100') return maxSize <= 100;
      if (selectedRange === 'under150') return maxSize <= 150;
      if (selectedRange === 'under200') return maxSize <= 200;
      if (selectedRange === 'under300') return maxSize <= 300;
      if (selectedRange === 'above300') return maxSize > 300;

      return false;
    };

    // 5. Filter by size (checking custom fields Size/size)
    if (size && size !== '') {
      filteredList = filteredList.filter(p => {
        const prodSizeStr = p.customFields && (
          p.customFields.Size || p.customFields.size || p.customFields['spawn size'] || p.customFields['Spawn size']
        );
        return matchProductSize(String(prodSizeStr || ''), size);
      });
    }

    const grouped = groupProducts(filteredList, categories);

    res.render('products', { 
      title: 'Sản phẩm - EZ Studio',
      groupedProducts: grouped,
      categories: categories,
      versions: availableVersions,
      sizes: availableSizes,
      filters: {
        q: q || '',
        category: category || '',
        price: price || '',
        version: version || '',
        size: size || ''
      }
    });
  } catch (err) {
    console.error('Error rendering products catalog:', err);
    res.status(500).send('Internal Server Error');
  }
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

// POST Checkout (Atomic Wallet Deduction via zCoin)
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

    if (itemsToBuy.length === 0) {
      return res.redirect('/cart?error=Không có sản phẩm hợp lệ trong giỏ hàng');
    }

    if ((userData.balance || 0) < total) {
      return res.redirect('/user/topup?error=Số dư ví không đủ để thanh toán. Vui lòng nạp thêm.');
    }

    // Deduct buyer balance
    const buyerNewBalance = (userData.balance || 0) - total;
    await userRef.set({
      balance: buyerNewBalance,
      walletBalance: buyerNewBalance
    }, { merge: true });

    req.session.user.balance = buyerNewBalance;

    // Create a completed order record
    const orderRef = await db.collection('orders').add({
      userId: req.session.user.id,
      items: itemsToBuy,
      totalAmount: `${total} zCoin`,
      totalPrice: total,
      amountVnd: total * 1000,
      paymentMethod: 'zCoin',
      status: 'pending',
      createdAt: new Date().toISOString()
    });

    // Deliver products and update seller earnings using order-service
    await completeOrder(orderRef.id);

    req.session.cart = []; // Clear cart

    res.redirect('/user/library?success=Thanh toán thành công! Sản phẩm đã nằm trong thư viện của bạn.');

  } catch (error) {
    console.error('Checkout Error:', error);
    res.redirect('/cart?error=Lỗi hệ thống khi thanh toán');
  }
});

// POST Checkout via Bank Transfer (VietQR)
router.post('/checkout/bank', async (req, res) => {
  if (!req.session.user) {
    return res.redirect('/login?redirect=/cart');
  }

  if (!req.session.cart || req.session.cart.length === 0) {
    return res.redirect('/cart?error=Giỏ hàng trống');
  }

  try {
    const productsSnapshot = await db.collection('products').get();
    let total = 0;
    const itemsToBuy = [];

    req.session.cart.forEach(cartItem => {
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

    if (itemsToBuy.length === 0) {
      return res.redirect('/cart?error=Không có sản phẩm hợp lệ trong giỏ hàng');
    }

    // Create a pending order in Firestore
    const orderRef = await db.collection('orders').add({
      userId: req.session.user.id,
      items: itemsToBuy,
      totalAmount: `${total} zCoin`,
      totalPrice: total,
      amountVnd: total * 1000, // 1 zCoin = 1000 VND
      paymentMethod: 'Bank',
      status: 'pending',
      createdAt: new Date().toISOString()
    });

    req.session.cart = []; // Clear the cart since order is generated

    res.redirect(`/checkout/payment?orderId=${orderRef.id}`);
  } catch (error) {
    console.error('Bank Checkout Init Error:', error);
    res.redirect('/cart?error=Lỗi hệ thống khi khởi tạo thanh toán');
  }
});

// GET Order Payment details page
router.get('/checkout/payment', async (req, res) => {
  if (!req.session.user) {
    return res.redirect('/login');
  }

  const { orderId } = req.query;
  if (!orderId) {
    return res.redirect('/products?error=Thiếu mã đơn hàng');
  }

  try {
    const orderDoc = await db.collection('orders').doc(orderId).get();
    if (!orderDoc.exists) {
      return res.redirect('/products?error=Đơn hàng không tồn tại');
    }

    const orderData = orderDoc.data();
    if (orderData.userId !== req.session.user.id) {
      return res.redirect('/products?error=Không có quyền xem đơn hàng này');
    }

    if (orderData.status === 'completed') {
      return res.redirect('/user/library?success=Đơn hàng của bạn đã hoàn thành!');
    }

    const settingsDoc = await db.collection('settings').doc('general').get();
    const settings = settingsDoc.exists ? settingsDoc.data() : {};

    res.render('checkout-payment', {
      title: 'Thanh toán đơn hàng - EZ Studio',
      order: { id: orderId, ...orderData },
      settings,
      user: req.session.user
    });
  } catch (error) {
    console.error('Get Payment Details Page Error:', error);
    res.redirect('/cart?error=Lỗi tải trang thanh toán');
  }
});

// GET API to check order payment status
router.get('/api/checkout/status/:orderId', async (req, res) => {
  try {
    const orderDoc = await db.collection('orders').doc(req.params.orderId).get();
    if (!orderDoc.exists) {
      return res.status(404).json({ error: 'Order not found' });
    }
    const data = orderDoc.data();
    res.json({ status: data.status });
  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error' });
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

// POST AI Chatbot endpoint
router.post('/api/chat', async (req, res) => {
  const { message } = req.body;
  if (!message || message.trim() === '') {
    return res.status(400).json({ error: 'Message is required' });
  }

  const prompt = message.trim();
  
  let apiKey = null;
  try {
    const settingsDoc = await db.collection('settings').doc('general').get();
    if (settingsDoc.exists) {
      const settingsData = settingsDoc.data();
      // Kiểm tra cấu hình key Cocolink mới từ hệ thống Firestore (nếu có)
      if (settingsData.chatbot && settingsData.chatbot.cocolinkApiKey) {
        apiKey = settingsData.chatbot.cocolinkApiKey.trim();
      }
    }
  } catch (err) {
    console.error('❌ Error fetching chatbot api key from firestore:', err.message);
  }

  // Fallback đọc biến môi trường COCOLINK_API_KEY
  if (!apiKey || apiKey === '') {
    apiKey = process.env.COCOLINK_API_KEY;
  }

  if (!apiKey) {
    console.error('❌ COCOLINK_API_KEY is missing. Cannot proceed with AI request.');
    return res.status(500).json({ error: 'Chatbot service configuration missing.' });
  }

  try {
    // 1. Lấy dữ liệu sản phẩm thực tế từ Firestore
    const productsList = await getAllProducts();
    
    // 2. Định dạng danh sách sản phẩm thành text để inject vào System Prompt
    const catalogContext = productsList.length > 0 
      ? productsList.map(p => `- ${p.title}: ${p.description || 'Không có mô tả'} (Giá: ${p.priceNumber || 0} zCoin)`).join('\n')
      : 'Hiện tại chưa cập nhật sản phẩm nào trên hệ thống cửa hàng.';

    // 3. Gọi API của Cocolink với model qwen3.6-plus
    const response = await fetch('https://www.cocolink.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'qwen3.6-plus',
        messages: [
          {
            role: 'system',
            content: `Bạn là "EZ Assistant" - một trợ lý AI thông minh, nhiệt tình và thân thiện của EZ Studio (ezstore).
EZ Studio là nền tảng cung cấp tài nguyên Minecraft chuyên nghiệp hàng đầu tại Việt Nam.
Các dịch vụ chính của EZ Studio:
1. Minecraft Server Setup: Survival, Skyblock, Lifesteal, Bedwars... thiết lập từ A-Z tối ưu hiệu năng tốt nhất.
2. Custom Models: Thiết kế Item/Armor/Weapon 3D độc quyền (ItemsAdder, Oraxen, MythicMobs).
3. Tối ưu hóa & Bảo mật: Chống lag, chống crash, chống DDoS chuyên sâu cho Server.
Người sáng lập: Fin12n. Co-Owner: tomy067.

Dưới đây là DANH SÁCH SẢN PHẨM THỰC TẾ đang có tại cửa hàng. Hãy dựa vào danh sách này để tư vấn chính xác tên sản phẩm kèm giá cả khi khách hàng hỏi:
${catalogContext}

Bạn trả lời các câu hỏi bằng Tiếng Việt một cách ngắn gọn, súc tích và có kèm emoji thân thiện. Hãy hướng dẫn người dùng mua hàng hoặc liên hệ nếu cần hỗ trợ trực tiếp.`
          },
          {
            role: 'user',
            content: prompt
          }
        ]
      })
    });

    if (!response.ok) {
      throw new Error(`Cocolink API returned status ${response.status}`);
    }

    const data = await response.json();
    const reply = data.choices[0].message.content;
    
    return res.json({ reply });

  } catch (error) {
    console.error('❌ Cocolink API Error:', error.message);
    // Khi có lỗi từ API, trả về status 500 để phía Frontend (chatbot.js) nhảy vào block catch và hiển thị thông báo bảo trì mặc định
    return res.status(500).json({ error: 'Hệ thống AI đang bận.' });
  }
});

module.exports = router;
