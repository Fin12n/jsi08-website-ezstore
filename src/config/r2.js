const { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
require('dotenv').config();

const hasR2Config =
  process.env.R2_ACCOUNT_ID &&
  process.env.R2_ACCESS_KEY_ID &&
  process.env.R2_SECRET_ACCESS_KEY &&
  process.env.R2_BUCKET_NAME;

let s3Client = null;

if (hasR2Config) {
  try {
    s3Client = new S3Client({
      region: 'auto',
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY
      }
    });
    console.log('✔ Successfully configured Cloudflare R2 client connection');
  } catch (err) {
    console.error('❌ Failed to initialize Cloudflare R2 Client:', err.message);
  }
} else {
  console.warn('⚠️ Cloudflare R2 keys missing in env. Digital downloads may not be available.');
}

async function generateUploadUrl(fileKey, fileType) {
  if (!s3Client) throw new Error('Cloudflare R2 client is not configured');
  const command = new PutObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME,
    Key: fileKey,
    ContentType: fileType
  });
  // Presigned URL valid for 1 hour (3600 seconds)
  return await getSignedUrl(s3Client, command, { expiresIn: 3600 });
}

async function generateDownloadUrl(fileKey) {
  if (!s3Client) throw new Error('Cloudflare R2 client is not configured');
  const command = new GetObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME,
    Key: fileKey
  });
  // Presigned download URL valid for 15 minutes (900 seconds)
  return await getSignedUrl(s3Client, command, { expiresIn: 900 });
}

async function deleteFile(fileKey) {
  if (!s3Client) return;
  try {
    const command = new DeleteObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: fileKey
    });
    await s3Client.send(command);
    console.log(`✔ Successfully deleted file from R2: ${fileKey}`);
  } catch (err) {
    console.error(`❌ Failed to delete file ${fileKey} from R2:`, err.message);
  }
}

module.exports = {
  s3Client,
  isR2Active: !!s3Client,
  generateUploadUrl,
  generateDownloadUrl,
  deleteFile
};
