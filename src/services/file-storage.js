/**
 * File Storage Service — Cloudflare R2 with Local Fallback
 * Pattern: Try R2 → If no config or error → Save to public/uploads/ locally
 *
 * R2 env vars needed: R2_ACCOUNT_ID, R2_ACCESS_KEY, R2_SECRET_KEY, R2_BUCKET, R2_PUBLIC_URL
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Check if R2 is configured
const hasR2Config = !!(
  process.env.R2_ACCOUNT_ID &&
  process.env.R2_ACCESS_KEY &&
  process.env.R2_SECRET_KEY &&
  process.env.R2_BUCKET
);

let S3Client, PutObjectCommand;
let r2Client = null;

if (hasR2Config) {
  try {
    // @aws-sdk/client-s3 is compatible with Cloudflare R2 (S3-compatible API)
    // Install with: npm install @aws-sdk/client-s3
    const awsSdk = require('@aws-sdk/client-s3');
    S3Client = awsSdk.S3Client;
    PutObjectCommand = awsSdk.PutObjectCommand;

    r2Client = new S3Client({
      region: 'auto',
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY,
        secretAccessKey: process.env.R2_SECRET_KEY,
      },
    });

    console.log('✔ Cloudflare R2 storage initialized');
  } catch (err) {
    console.warn('⚠️ @aws-sdk/client-s3 not installed. Falling back to local storage. Run: npm install @aws-sdk/client-s3');
    r2Client = null;
  }
} else {
  console.warn('⚠️ R2 config missing in .env. File storage will use local public/uploads/');
}

// Ensure local uploads directory exists
const LOCAL_UPLOAD_DIR = path.join(__dirname, '../../public/uploads');
if (!fs.existsSync(LOCAL_UPLOAD_DIR)) {
  fs.mkdirSync(LOCAL_UPLOAD_DIR, { recursive: true });
}

/**
 * Compute SHA-256 hash of a file buffer.
 * Used for file integrity verification and dedup detection.
 *
 * @param {Buffer} buffer - File content
 * @returns {string} Hex-encoded SHA-256 hash
 */
function getFileHash(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * Upload a file — tries R2 first, falls back to local storage.
 *
 * @param {Buffer} buffer    - File content as Buffer
 * @param {string} filename  - Desired filename (will be prefixed with timestamp for uniqueness)
 * @param {string} mimetype  - MIME type, e.g. 'image/png', 'application/zip'
 * @returns {Promise<{url: string, hash: string, storage: 'r2'|'local'}>}
 */
async function uploadFile(buffer, filename, mimetype) {
  const hash = getFileHash(buffer);
  const timestamp = Date.now();
  const safeFilename = `${timestamp}-${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`;

  // Try Cloudflare R2
  if (r2Client) {
    try {
      const command = new PutObjectCommand({
        Bucket: process.env.R2_BUCKET,
        Key: `uploads/${safeFilename}`,
        Body: buffer,
        ContentType: mimetype,
        Metadata: {
          'original-filename': filename,
          'sha256': hash,
        },
      });

      await r2Client.send(command);

      const publicUrl = process.env.R2_PUBLIC_URL
        ? `${process.env.R2_PUBLIC_URL}/uploads/${safeFilename}`
        : `https://${process.env.R2_BUCKET}.${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/uploads/${safeFilename}`;

      console.log(`[FILE] Uploaded to R2: ${safeFilename}`);
      return { url: publicUrl, hash, storage: 'r2' };
    } catch (err) {
      console.error(`[FILE] R2 upload failed, falling back to local: ${err.message}`);
    }
  }

  // Fallback: save to local disk
  const localPath = path.join(LOCAL_UPLOAD_DIR, safeFilename);
  fs.writeFileSync(localPath, buffer);
  const localUrl = `/uploads/${safeFilename}`;

  console.log(`[FILE] Saved locally: ${localUrl}`);
  return { url: localUrl, hash, storage: 'local' };
}

/**
 * Delete a file by URL.
 * Determines storage type from URL pattern and deletes accordingly.
 *
 * @param {string} fileUrl - The URL returned by uploadFile()
 * @returns {Promise<boolean>} true if deleted, false if failed/not found
 */
async function deleteFile(fileUrl) {
  try {
    if (fileUrl.startsWith('/uploads/')) {
      // Local file
      const filename = path.basename(fileUrl);
      const localPath = path.join(LOCAL_UPLOAD_DIR, filename);
      if (fs.existsSync(localPath)) {
        fs.unlinkSync(localPath);
        return true;
      }
      return false;
    }

    if (r2Client && (fileUrl.includes('r2.cloudflarestorage.com') || (process.env.R2_PUBLIC_URL && fileUrl.startsWith(process.env.R2_PUBLIC_URL)))) {
      // R2 file — extract key from URL
      const { DeleteObjectCommand } = require('@aws-sdk/client-s3');
      const urlPath = new URL(fileUrl).pathname;
      const key = urlPath.startsWith('/') ? urlPath.slice(1) : urlPath;

      await r2Client.send(new DeleteObjectCommand({
        Bucket: process.env.R2_BUCKET,
        Key: key,
      }));
      return true;
    }

    return false;
  } catch (err) {
    console.error(`[FILE] Delete failed for ${fileUrl}:`, err.message);
    return false;
  }
}

module.exports = { uploadFile, deleteFile, getFileHash, hasR2Config };
