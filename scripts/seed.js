const db = require('../src/config/firebase');

const initialProducts = [
  {
    id: 'sapphire-knight',
    title: 'Sapphire Knight Set',
    description: 'Stunning armor set of Sapphire Knight ready to suit you',
    image: '/imgs/1Banner_sapphire.png',
    originalPrice: '300.000đ',
    salePrice: '199.000 VND',
    carousel: ['/imgs/1Banner_sapphire.png', '/imgs/2Banner_sapphire.jpg'],
    features: [
      'Hỗ trợ cài đặt sau khi nhận hàng!',
      'Hỗ trợ các phiên bản từ 1.16+',
      'Hỗ trợ sửa lỗi liên quan trong vòng 60 ngày!'
    ],
    itemsList: [
      'Sapphire Helmet',
      'Sapphire Chestplate',
      'Sapphire Leggings',
      'Sapphire Boots',
      'Sapphire Sword',
      'Sapphire Pickaxe',
      'Sapphire Shovel',
      'Sapphire Axe',
      'Sapphire Bow'
    ],
    plugins: ['Nexo', 'ItemsAdders'],
    gifts: [
      'Vanilla resourcepack',
      'Hướng dẫn sử dụng chi tiết',
      'Bảo hành đổi trả trong 15 ngày đầu (Kể từ ngày mua)'
    ],
    category: 'models'
  },
  {
    id: 'voidtech-pack',
    title: 'Voidtech Pack [64x]',
    description: 'Voidtech Pack Weapons Tools & Cosmetic',
    image: '/imgs/voidtech-models/01JTWVAVQMWNB58C168CPJ03F1.jpg',
    originalPrice: '500.000đ',
    salePrice: '99.000 VND',
    carousel: [
      '/imgs/voidtech-models/01JTWVAVQMWNB58C168CPJ03F1.jpg',
      '/imgs/voidtech-models/01JTWVCG3NBZAHN32675VTJV4H.gif'
    ],
    features: [
      'Hỗ trợ cài đặt sau khi nhận hàng!',
      'Hỗ trợ các phiên bản từ 1.16+',
      'Hỗ trợ sửa lỗi liên quan trong vòng 60 ngày!'
    ],
    itemsList: [
      'Helmet & Chestplate',
      'Leggings & Boots',
      'Wings (Trang trí)',
      'Sword & Staff',
      'Pickaxe & Axe & Shovel',
      'Bow & Crossbows & Shield',
      'FishingRod',
      'Chest + Key'
    ],
    plugins: ['Nexo', 'ItemsAdders', 'CosmeticCore', 'MagicCosmetics', 'Oraxen', 'HMCCosmetics'],
    gifts: [
      'Vanilla resourcepack',
      'Hướng dẫn sử dụng chi tiết',
      'Bảo hành đổi trả trong 15 ngày đầu (Kể từ ngày mua)'
    ],
    category: 'models'
  },
  {
    id: 'underwater-lobby',
    title: 'Lobby Underwater City ➔ 800x800',
    description: 'The map is supported for versions 1.8 - 1.18+.',
    image: '/imgs/2Banner_sapphire.jpg',
    originalPrice: '500.000đ',
    salePrice: '99.000 VND',
    carousel: ['/imgs/2Banner_sapphire.jpg'],
    features: ['Hỗ trợ cài đặt!', 'Phiên bản 1.8 - 1.18+'],
    itemsList: ['Lobby Spawn 800x800', 'Underwater Theme'],
    plugins: ['Vanilla Server', 'PaperSpigot'],
    gifts: ['Bảo hành 15 ngày'],
    category: 'maps'
  },
  {
    id: 'skyblock-dhs015',
    title: 'Skyblock DHS015',
    description: 'Spigot 1.12.2 (1.12.x -> 1.16.x) custom skyblock island spawn.',
    image: '/imgs/Skyblock DHS015.png',
    originalPrice: '95.000đ',
    salePrice: '49.000 VND',
    carousel: ['/imgs/Skyblock DHS015.png'],
    features: ['Spigot 1.12.2 (1.12.x -> 1.16.x)'],
    itemsList: ['Skyblock Island Spawn'],
    plugins: ['ASkyBlock', 'BentoBox'],
    gifts: ['Bảo hành 15 ngày'],
    category: 'maps'
  },
  {
    id: 'blossom-mega-earth',
    title: 'Blossom Mega Earth',
    description: 'Full custom earth survival setup with gorgeous resource packs.',
    image: '/imgs/banner1.webp',
    originalPrice: '350.000đ',
    salePrice: '249.000 VND',
    carousel: ['/imgs/banner1.webp'],
    features: ['Hỗ trợ setup', 'Resource Pack tùy chỉnh'],
    itemsList: ['Earth Survival Config Files'],
    plugins: ['EssentialsX', 'Towny'],
    gifts: ['Bảo hành 15 ngày'],
    category: 'setups'
  }
];

const initialCategories = [
  { slug: 'models', name: 'Models & Textures', description: 'Gói 3D models và resource pack' },
  { slug: 'maps', name: 'Maps & Schematics', description: 'Bản đồ, spawn, lobby' },
  { slug: 'setups', name: 'Server Setups', description: 'Gói setup server hoàn chỉnh' }
];

const initialSettings = {
  id: 'general',
  exchangeRate: 1,
  bankInfo: { bankName: 'Vietcombank', accountName: 'NGUYEN VAN A', accountNumber: '1234567890' },
  commissionRates: { standard: 10, premium: 8, elite: 5 },
  seoMeta: { metaTitle: 'EZ Studio - Chợ sản phẩm số', metaDescription: '', metaKeywords: '' },
  banners: [],
};

async function seed() {
  if (db.isMock) {
    console.error('❌ Cannot seed database: Firebase Admin is running in MOCK mode.');
    console.error('Please configure FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY in your .env file.');
    process.exit(1);
  }

  console.log('🌱 Starting Firestore Database Seeding...');
  
  try {
    for (const product of initialProducts) {
      console.log(`Uploading Product: ${product.title} (${product.id})...`);
      await db.collection('products').doc(product.id).set(product);
    }
    
    for (const cat of initialCategories) {
      console.log(`Uploading Category: ${cat.name}...`);
      await db.collection('categories').doc(cat.slug).set(cat);
    }

    console.log(`Uploading Settings...`);
    await db.collection('settings').doc('general').set(initialSettings);

    console.log('✔ Database seeded successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Seeding process encountered an error:', error);
    process.exit(1);
  }
}

seed();
