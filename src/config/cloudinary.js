const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const hasCloudinaryConfig = 
  process.env.CLOUDINARY_CLOUD_NAME && 
  process.env.CLOUDINARY_API_KEY && 
  process.env.CLOUDINARY_API_SECRET;

let storage;
let isCloudinaryActive = false;

if (hasCloudinaryConfig) {
  try {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET
    });

    storage = new CloudinaryStorage({
      cloudinary: cloudinary,
      params: {
        folder: 'ez-studio',
        allowed_formats: ['jpg', 'png', 'jpeg', 'gif', 'webp'],
        transformation: [{ width: 800, height: 600, crop: 'limit' }]
      }
    });
    isCloudinaryActive = true;
    console.log('✔ Successfully configured Cloudinary storage');
  } catch (error) {
    console.error('❌ Failed to configure Cloudinary. Falling back to local storage:', error.message);
  }
}

if (!isCloudinaryActive) {
  console.warn('⚠️ Cloudinary keys missing or failed. Using Local Disk Storage.');
  
  storage = multer.diskStorage({
    destination: (req, file, cb) => {
      const uploadDir = process.env.VERCEL
        ? '/tmp/uploads'
        : path.join(__dirname, '../public/uploads');
      // Create folder if it doesn't exist
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      const ext = path.extname(file.originalname);
      cb(null, `prod-${uniqueSuffix}${ext}`);
    }
  });
}

const upload = multer({ 
  storage: storage,
  limits: { 
    fileSize: 50 * 1024 * 1024,  // Limit 50MB
    fieldSize: 50 * 1024 * 1024 // Limit 50MB to support base64 images in fields
  }
});

module.exports = {
  upload,
  cloudinary,
  isCloudinaryActive
};
