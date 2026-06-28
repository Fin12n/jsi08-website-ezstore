const fs = require('fs');
const path = require('path');

// Load translations once on startup
const translationsPath = path.join(__dirname, '../locales/translation.json');
let translations = {};
try {
  translations = JSON.parse(fs.readFileSync(translationsPath, 'utf8'));
} catch (error) {
  console.error('❌ Không thể tải file translation.json:', error);
}

// Helper to check if IP is private/local
function isLocalIp(ip) {
  return !ip || ip === '::1' || ip === '127.0.0.1' || ip.startsWith('192.168.') || ip.startsWith('10.') || ip.startsWith('172.16.') || ip.startsWith('::ffff:127.0.0.1');
}

module.exports = async function i18n(req, res, next) {
  let lang = req.cookies && req.cookies.lang;

  if (!lang) {
    // 1. Attempt Auto-detect by IP via ip-api.com (timeout 600ms)
    let clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
    if (clientIp.includes(',')) {
      clientIp = clientIp.split(',')[0].trim();
    }
    
    // Normalize IPv6 mapped IPv4
    if (clientIp.startsWith('::ffff:')) {
      clientIp = clientIp.substring(7);
    }

    let detectedLang = null;

    if (clientIp && !isLocalIp(clientIp)) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 600); // 600ms timeout

        const response = await fetch(`http://ip-api.com/json/${clientIp}`, { signal: controller.signal });
        clearTimeout(timeoutId);
        
        const data = await response.json();
        if (data && data.status === 'success') {
          if (data.countryCode === 'VN') {
            detectedLang = 'vi';
          } else {
            detectedLang = 'en';
          }
          console.log(`🌐 i18n Auto-detect by IP (${clientIp}): ${data.countryCode} -> ${detectedLang}`);
        }
      } catch (err) {
        // Silent catch, fallback to Accept-Language
        console.log(`⚠️ i18n Geo IP check failed or timed out for IP ${clientIp}:`, err.name === 'AbortError' ? 'Timeout' : err.message);
      }
    }

    // 2. Fallback to Accept-Language header
    if (!detectedLang) {
      const acceptLang = req.headers['accept-language'] || '';
      if (acceptLang.toLowerCase().startsWith('vi')) {
        detectedLang = 'vi';
      } else {
        detectedLang = 'en';
      }
      console.log(`🌐 i18n Auto-detect by Accept-Language: ${detectedLang}`);
    }

    lang = detectedLang;
    // Store in cookie for subsequent requests
    res.cookie('lang', lang, { maxAge: 365 * 24 * 60 * 60 * 1000, httpOnly: false });
  }

  // Ensure lang is either 'vi' or 'en'
  if (lang !== 'vi' && lang !== 'en') {
    lang = 'vi';
  }

  // Set properties on req and res.locals
  req.lang = lang;
  res.locals.lang = lang;

  // Translate function
  res.locals.__ = function (key) {
    const dict = translations[lang] || translations['vi'] || {};
    return dict[key] !== undefined ? dict[key] : key;
  };

  next();
};
