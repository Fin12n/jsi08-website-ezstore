/**
 * TOTP Service — Two-Factor Authentication
 * Uses otplib v13.4+ (TOTP class API) + qrcode for QR generation.
 * Implements Option B: OTP confirm dialog before sensitive admin actions.
 */
const { TOTP, generateSecret: genSecret } = require('otplib');
const QRCode = require('qrcode');

// Create a TOTP instance with custom options
const totp = new TOTP();
totp.options = {
  window: 1,
  step: 30,
  digits: 6,
  algorithm: 'sha1',
};

/**
 * Generate a new TOTP secret for an admin account.
 * Store this in Firestore users doc (encrypted at rest recommended).
 *
 * @returns {string} Base32-encoded TOTP secret
 */
function generateSecret() {
  return genSecret(20); // 20 bytes = strong enough for TOTP
}

/**
 * Generate an OTPAuth URI for QR code scanning (Google Authenticator, Authy, etc.)
 *
 * @param {string} email   - Admin's email address (label in authenticator app)
 * @param {string} secret  - The TOTP secret from generateSecret()
 * @param {string} [issuer='EZ Studio Admin'] - App name shown in authenticator
 * @returns {string} otpauth:// URI
 */
function generateOtpAuthUrl(email, secret, issuer = 'EZ Studio Admin') {
  return totp.keyuri(email, issuer, secret);
}

/**
 * Generate a QR code as a Data URL (base64 PNG) for embedding in <img> tags.
 *
 * @param {string} email   - Admin's email address
 * @param {string} secret  - The TOTP secret
 * @returns {Promise<string>} data:image/png;base64,... URL
 */
async function generateQRCodeDataUrl(email, secret) {
  const otpAuthUrl = generateOtpAuthUrl(email, secret);
  const qrDataUrl = await QRCode.toDataURL(otpAuthUrl, {
    width: 256,
    margin: 2,
    color: {
      dark: '#1a1a2e',  // Dark navy for dots
      light: '#ffffff', // White background
    },
  });
  return qrDataUrl;
}

/**
 * Verify a 6-digit TOTP token against the stored secret.
 * Allows 1 step window tolerance for minor clock drift.
 *
 * @param {string} secret - The admin's stored TOTP secret
 * @param {string} token  - The 6-digit code entered by admin
 * @returns {boolean} true if valid, false if invalid/expired
 */
function verifyToken(secret, token) {
  try {
    if (!secret || !token) return false;
    const cleanToken = String(token).replace(/\s/g, '').trim();
    return totp.verify({ token: cleanToken, secret });
  } catch (err) {
    console.error('[TOTP] Verification error:', err.message);
    return false;
  }
}

/**
 * Generate a current valid token (for testing / emergency recovery only).
 * Should NOT be exposed via any public API endpoint.
 *
 * @param {string} secret - The TOTP secret
 * @returns {string} Current 6-digit TOTP code
 */
function getCurrentToken(secret) {
  return totp.generate(secret);
}

module.exports = {
  generateSecret,
  generateOtpAuthUrl,
  generateQRCodeDataUrl,
  verifyToken,
  getCurrentToken,
};
