const admin = require('firebase-admin');
const { getFirestore } = require('firebase-admin/firestore');
require('dotenv').config();

let db;
let isMock = false;

// 1. Mock Data Fallback definition
const localMockProducts = [
  {
    id: 'sapphire-knight',
    title: 'Sapphire Knight Set',
    description: 'Stunning armor set of Sapphire Knight ready to suit you',
    image: '/imgs/1Banner_sapphire.png',
    originalPrice: '300 zCoin',
    salePrice: '199 zCoin',
    priceNumber: 199,
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
    originalPrice: '500 zCoin',
    salePrice: '99 zCoin',
    priceNumber: 99,
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
    originalPrice: '500 zCoin',
    salePrice: '99 zCoin',
    priceNumber: 99,
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
    originalPrice: '95 zCoin',
    salePrice: '49 zCoin',
    priceNumber: 49,
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
    originalPrice: '350 zCoin',
    salePrice: '249 zCoin',
    priceNumber: 249,
    carousel: ['/imgs/banner1.webp'],
    features: ['Hỗ trợ setup', 'Resource Pack tùy chỉnh'],
    itemsList: ['Earth Survival Config Files'],
    plugins: ['EssentialsX', 'Towny'],
    gifts: ['Bảo hành 15 ngày'],
    category: 'setups'
  }
];

// Check environment variables
const hasFirebaseConfig = 
  process.env.FIREBASE_PROJECT_ID && 
  process.env.FIREBASE_CLIENT_EMAIL && 
  process.env.FIREBASE_PRIVATE_KEY;

let realDb = null;
let useMockFallback = false;

if (hasFirebaseConfig) {
  try {
    const projectId = process.env.FIREBASE_PROJECT_ID.replace(/"/g, '');
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL.replace(/"/g, '');
    const privateKey = process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n').replace(/"/g, '');
    
    admin.initializeApp({
      credential: admin.cert({
        projectId: projectId,
        clientEmail: clientEmail,
        privateKey: privateKey
      })
    });
    realDb = getFirestore();
    console.log('✔ Successfully initialized Firebase Firestore Admin SDK');
  } catch (error) {
    console.error('❌ Failed to initialize Firebase Admin SDK. Falling back to MOCK mode:', error.message);
    useMockFallback = true;
  }
} else {
  console.warn('⚠️ Firebase configuration is missing in .env. Running in MOCK Mode.');
  useMockFallback = true;
}

// 2. Mock Firestore implementation for fallback
const store = {
  products: [...localMockProducts],
  users: [],
  transactions: [],
  orders: [],
  refunds: [],
  audit_logs: [],
  categories: [],
  coupons: [],
  settings: [
    {
      id: 'general',
      exchangeRate: 1,
      bankInfo: { bankName: '', accountName: '', accountNumber: '' },
      commissionRates: { standard: 10, premium: 8, elite: 5 },
      seoMeta: { metaTitle: 'EZ Studio - Chợ sản phẩm số', metaDescription: '', metaKeywords: '' },
      banners: [],
    }
  ],
  // New collections for Admin Panel v2
  refund_requests: [
    {
      id: 'refund-demo-001',
      buyerId: 'user-demo-001',
      sellerId: 'seller-demo-001',
      orderId: 'order-demo-001',
      amount: 99,
      reason: 'Sản phẩm không hoạt động đúng như mô tả.',
      evidenceUrls: [],
      status: 'pending',
      timestamp: new Date(Date.now() - 2 * 3600000).toISOString(),
    }
  ],
  topup_requests: [
    {
      id: 'topup-demo-001',
      userId: 'user-demo-001',
      amount: 200,
      method: 'bank',
      transferContent: 'NAP200K USER001',
      status: 'pending',
      timestamp: new Date(Date.now() - 1 * 3600000).toISOString(),
    }
  ],
  seller_applications: [
    {
      id: 'app-demo-001',
      userId: 'user-demo-002',
      email: 'newsellerl@example.com',
      displayName: 'Demo Seller',
      shopName: 'Demo Minecraft Shop',
      description: 'Tôi muốn bán các bộ skin và tài nguyên Minecraft chất lượng cao.',
      category: 'models',
      status: 'PENDING',
      createdAt: new Date(Date.now() - 24 * 3600000).toISOString(),
    }
  ],
  download_abuse_flags: [],
  wallet_transactions: [],
};

const mockDb = {
  isMock: true,
  collection: (collectionName) => {
    if (!store[collectionName]) {
      store[collectionName] = [];
    }
    return {
      get: async () => {
        const list = store[collectionName];
        return {
          docs: list.map(item => ({
            id: item.id,
            data: () => item
          }))
        };
      },
      doc: (docId) => {
        return {
          get: async () => {
            const list = store[collectionName];
            const item = list.find(x => x.id === docId);
            return {
              exists: !!item,
              id: docId,
              data: () => item
            };
          },
          set: async (data, options = {}) => {
            const list = store[collectionName];
            const idx = list.findIndex(x => x.id === docId);
            if (idx !== -1) {
              if (options.merge) {
                list[idx] = { ...list[idx], ...data, id: docId };
              } else {
                list[idx] = { id: docId, ...data };
              }
            } else {
              list.push({ id: docId, ...data });
            }
            return true;
          },
          delete: async () => {
            const list = store[collectionName];
            const idx = list.findIndex(x => x.id === docId);
            if (idx !== -1) {
              list.splice(idx, 1);
            }
            return true;
          },
          update: async (data) => {
            const list = store[collectionName];
            const idx = list.findIndex(x => x.id === docId);
            if (idx !== -1) {
              list[idx] = { ...list[idx], ...data, id: docId };
            } else {
              list.push({ id: docId, ...data });
            }
            return true;
          }
        };
      },
      add: async (data) => {
        const list = store[collectionName];
        const generatedId = 'mock-id-' + Math.random().toString(36).substr(2, 9);
        const newItem = { id: generatedId, ...data };
        list.push(newItem);
        return { id: generatedId };
      },
      where: (field, op, val) => {
        // Return an object that supports both get() and orderBy()
        const buildQuery = (currentFilters, sortConfig) => {
          return {
            get: async () => {
              const list = store[collectionName] || [];
              let filtered = list;
              
              // Apply filters
              currentFilters.forEach(f => {
                if (f.op === '==') {
                  filtered = filtered.filter(item => {
                    const itemVal = item[f.field];
                    if (typeof itemVal === 'string' && typeof f.val === 'string') {
                      return itemVal.toLowerCase().trim() === f.val.toLowerCase().trim();
                    }
                    return itemVal === f.val;
                  });
                }
              });

              // Apply sort
              if (sortConfig) {
                filtered.sort((a, b) => {
                  const valA = a[sortConfig.field];
                  const valB = b[sortConfig.field];
                  if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
                  if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
                  return 0;
                });
              }

              return {
                empty: filtered.length === 0,
                docs: filtered.map(item => ({
                  id: item.id,
                  data: () => item
                }))
              };
            },
            orderBy: (fld, dir = 'asc') => buildQuery(currentFilters, { field: fld, direction: dir })
          };
        };
        return buildQuery([{ field, op, val }], null);
      },
      orderBy: (field, direction = 'asc') => {
        return {
          get: async () => {
            const list = [...(store[collectionName] || [])];
            list.sort((a, b) => {
              const valA = a[field];
              const valB = b[field];
              if (valA < valB) return direction === 'asc' ? -1 : 1;
              if (valA > valB) return direction === 'asc' ? 1 : -1;
              return 0;
            });
            return {
              empty: list.length === 0,
              docs: list.map(item => ({
                id: item.id,
                data: () => item
              }))
            };
          }
        };
      }
    };
  }
};

const dbWrapper = {
  get isMock() {
    return useMockFallback || !realDb;
  },
  collection: (collectionName) => {
    return {
      get: async () => {
        if (!dbWrapper.isMock) {
          try {
            return await realDb.collection(collectionName).get();
          } catch (err) {
            console.error(`❌ Firestore collection('${collectionName}').get() failed. Using Mock for this request:`, err.message);
            // Per-request fallback only — do NOT set useMockFallback=true
          }
        }
        return mockDb.collection(collectionName).get();
      },
      doc: (docId) => {
        return {
          get: async () => {
            if (!dbWrapper.isMock) {
              try {
                return await realDb.collection(collectionName).doc(docId).get();
              } catch (err) {
                console.error(`❌ Firestore collection('${collectionName}').doc('${docId}').get() failed. Using Mock for this request:`, err.message);
              }
            }
            return mockDb.collection(collectionName).doc(docId).get();
          },
          set: async (data, options = {}) => {
            if (!dbWrapper.isMock) {
              try {
                return await realDb.collection(collectionName).doc(docId).set(data, options);
              } catch (err) {
                console.error(`❌ Firestore collection('${collectionName}').doc('${docId}').set() failed. Using Mock for this request:`, err.message);
              }
            }
            return mockDb.collection(collectionName).doc(docId).set(data, options);
          },
          delete: async () => {
            if (!dbWrapper.isMock) {
              try {
                return await realDb.collection(collectionName).doc(docId).delete();
              } catch (err) {
                console.error(`❌ Firestore collection('${collectionName}').doc('${docId}').delete() failed. Using Mock for this request:`, err.message);
              }
            }
            return mockDb.collection(collectionName).doc(docId).delete();
          },
          update: async (data) => {
            if (!dbWrapper.isMock) {
              try {
                return await realDb.collection(collectionName).doc(docId).update(data);
              } catch (err) {
                console.error(`❌ Firestore collection('${collectionName}').doc('${docId}').update() failed. Using Mock for this request:`, err.message);
              }
            }
            return mockDb.collection(collectionName).doc(docId).update(data);
          }
        };
      },
      add: async (data) => {
        if (!dbWrapper.isMock) {
          try {
            return await realDb.collection(collectionName).add(data);
          } catch (err) {
            console.error(`❌ Firestore collection('${collectionName}').add() failed. Using Mock for this request:`, err.message);
          }
        }
        return mockDb.collection(collectionName).add(data);
      },
      where: (field, op, val) => {
        // Wrapper for where to support chainable .orderBy()
        const mockChain = mockDb.collection(collectionName).where(field, op, val);
        const wrapChain = (realChain, mChain) => {
          return {
            get: async () => {
              if (!dbWrapper.isMock && realChain) {
                try {
                  return await realChain.get();
                } catch (err) {
                  console.error(`❌ Firestore collection('${collectionName}') query get() failed. Using Mock for this request:`, err.message);
                }
              }
              return mChain.get();
            },
            orderBy: (fld, dir = 'asc') => wrapChain(
              realChain ? realChain.orderBy(fld, dir) : null,
              mChain.orderBy(fld, dir)
            )
          };
        };
        
        let initialRealChain = null;
        if (!dbWrapper.isMock) {
          try {
            initialRealChain = realDb.collection(collectionName).where(field, op, val);
          } catch(e) {
            console.error(`❌ Firestore where() chain init failed:`, e.message);
          }
        }
        return wrapChain(initialRealChain, mockChain);
      },
      orderBy: (field, direction = 'asc') => {
        return {
          get: async () => {
            if (!dbWrapper.isMock) {
              try {
                return await realDb.collection(collectionName).orderBy(field, direction).get();
              } catch (err) {
                console.error(`❌ Firestore collection('${collectionName}').orderBy('${field}', '${direction}').get() failed. Using Mock for this request:`, err.message);
              }
            }
            return mockDb.collection(collectionName).orderBy(field, direction).get();
          }
        };
      }
    };
  }
};

module.exports = dbWrapper;
