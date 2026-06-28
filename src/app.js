const express = require('express');
const path = require('path');
const morgan = require('morgan');
const helmet = require('helmet');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Logging Middleware
app.use(morgan('dev'));

// Secure HTTP Headers with Helmet (Customized CSP to allow external CDNs)
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "cdnjs.cloudflare.com", "cdn.jsdelivr.net", "'unsafe-inline'", "'unsafe-eval'"],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: ["'self'", "cdnjs.cloudflare.com", "cdn.jsdelivr.net", "fonts.googleapis.com", "'unsafe-inline'"],
      fontSrc: ["'self'", "cdnjs.cloudflare.com", "fonts.googleapis.com", "fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "onlinezoo.asia", "*"],
      connectSrc: ["'self'"],
      upgradeInsecureRequests: null
    }
  }
}));

// Body Parsers
app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf.toString();
  }
}));
app.use(express.urlencoded({ extended: true }));

const cookieParser = require('cookie-parser');
const i18n = require('./middlewares/i18n');

app.use(cookieParser());
app.use(i18n);

// Session Configuration — using cookie-session (stateless, serverless-compatible)
// Stores session data in a signed+encrypted cookie on the client.
// Zero database writes per request — eliminates Firestore DEADLINE_EXCEEDED timeouts on Vercel.
const cookieSession = require('cookie-session');

app.use(cookieSession({
  name: 'ez-session',
  keys: [
    process.env.SESSION_SECRET || 'ez-studio-super-secret-key-38472948',
    process.env.SESSION_SECRET_FALLBACK || 'ez-studio-fallback-key-1234567890'
  ],
  maxAge: 24 * 60 * 60 * 1000, // 24 Hours
  httpOnly: true,
  // Use secure cookies on production (Vercel = HTTPS), allow insecure on local dev
  secure: process.env.NODE_ENV !== 'development',
  sameSite: 'lax'
}));

// Compatibility shim: cookie-session doesn't have a destroy() method by default.
// Attach req.session.destroy() to match express-session API used in auth routes.
app.use((req, res, next) => {
  if (req.session && !req.session.destroy) {
    req.session.destroy = (cb) => {
      req.session = null;
      if (cb) cb(null);
    };
  }
  next();
});

console.log('✔ Session: Using cookie-session (stateless, serverless-safe)');

// Expose Session variables to EJS views
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  if (!req.session.cart) {
    req.session.cart = [];
  }
  res.locals.cart = req.session.cart;

  // Theme selection
  res.locals.theme = req.cookies.theme || 'dark';

  // Flash message system — read from session, expose to views, then clear
  // This keeps URLs clean (no ?error= query strings)
  res.locals.flashError = req.session.flashError || null;
  res.locals.flashSuccess = req.session.flashSuccess || null;
  delete req.session.flashError;
  delete req.session.flashSuccess;

  // Intercept standard res.redirect to automatically convert query parameter alerts to flash messages
  const originalRedirect = res.redirect;
  res.redirect = function(url) {
    if (typeof url === 'string') {
      try {
        const dummyBase = 'http://localhost';
        const parsedUrl = new URL(url, dummyBase);
        
        let hasParams = false;
        if (parsedUrl.searchParams.has('success')) {
          req.session.flashSuccess = parsedUrl.searchParams.get('success');
          parsedUrl.searchParams.delete('success');
          hasParams = true;
        }
        if (parsedUrl.searchParams.has('error')) {
          req.session.flashError = parsedUrl.searchParams.get('error');
          parsedUrl.searchParams.delete('error');
          hasParams = true;
        }
        
        if (hasParams) {
          const cleanPath = url.startsWith('/')
            ? parsedUrl.pathname + parsedUrl.search + parsedUrl.hash
            : parsedUrl.href;
          return originalRedirect.call(this, cleanPath);
        }
      } catch (e) {
        console.error('Error in redirect interceptor:', e);
      }
    }
    return originalRedirect.call(this, url);
  };

  // Helper: set flash and redirect in one call
  res.flashRedirect = function(url, type, message) {
    req.session['flash' + (type === 'error' ? 'Error' : 'Success')] = message;
    return res.redirect(url);
  };

  next();
});




// Setup EJS View Engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Serve Static Files
app.use(express.static(path.join(__dirname, 'public')));

// Fallback for missing images to prevent 404 spam
app.get('/img/no-img.png', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'imgs', 'logo.webp'));
});

// Force-logout check: if admin set forceLogoutAt on a user, invalidate their session.
// Only run for authenticated users on non-static paths.
app.use(async (req, res, next) => {
  // Skip for static assets to avoid unnecessary Firestore queries
  const isStaticAsset = /\.(js|css|png|jpg|jpeg|gif|webp|ico|svg|woff|woff2|ttf|eot)$/i.test(req.path);
  if (isStaticAsset) return next();

  if (req.session && req.session.user && req.session.user.id) {
    try {
      const userId = req.session.user.id;
      const userDoc = await db.collection('users').doc(userId).get();
      if (userDoc.exists) {
        const userData = userDoc.data();
        if (userData.forceLogoutAt) {
          const forceAt = new Date(userData.forceLogoutAt);
          const sessionStart = new Date(req.session.loginAt || 0);
          if (forceAt > sessionStart) {
            req.session.destroy();
            return res.redirect('/login?error=Phiên đăng nhập của bạn đã bị hủy bởi Admin.');
          }
        }
      }
    } catch (e) {
      // Silent fail — don't break normal requests if force-logout check fails
    }
  }
  next();
});

// Routes
const mainRouter = require('./routes/index');
const authRouter = require('./routes/auth');
const userRouter = require('./routes/user');
const webhookRouter = require('./routes/webhook');
const sellerRouter = require('./routes/seller');

// Admin: core router (legacy) + new modular sub-routes
const { isAdmin } = require('./middlewares/auth');
const adminDashboardApi = require('./routes/admin/dashboard');
const adminUsersRouter = require('./routes/admin/users');
const adminSellersRouter = require('./routes/admin/sellers');
const adminProductsRouter = require('./routes/admin/products');
const adminTransactionsRouter = require('./routes/admin/transactions');
const adminRefundsRouter = require('./routes/admin/refunds');
const adminSecurityRouter = require('./routes/admin/security');
const adminSettingsRouter = require('./routes/admin/settings');

app.use('/', mainRouter);
app.use('/', authRouter);

// Mount new admin sub-routes (all protected by isAdmin middleware)
app.use('/admin/api/dashboard', isAdmin, adminDashboardApi);
app.use('/admin', isAdmin, adminUsersRouter);
app.use('/admin/sellers', isAdmin, adminSellersRouter);
app.use('/admin/products', isAdmin, adminProductsRouter);
app.use('/admin/transactions', isAdmin, adminTransactionsRouter);
app.use('/admin/refunds', isAdmin, adminRefundsRouter);
app.use('/admin/security', isAdmin, adminSecurityRouter);
app.use('/admin/settings', isAdmin, adminSettingsRouter);

// Legacy admin router (categories, overview, applications — to be migrated later)
const adminRouter = require('./routes/admin');
app.use('/admin', adminRouter);

app.use('/user', userRouter);
app.use('/webhook', webhookRouter);
app.use('/seller', sellerRouter);

app.get('/change-lang/:lang', (req, res) => {
  const lang = req.params.lang;
  if (lang === 'vi' || lang === 'en') {
    res.cookie('lang', lang, { maxAge: 365 * 24 * 60 * 60 * 1000, httpOnly: false });
  }
  res.redirect(req.get('referer') || '/');
});


// 404 Handle
app.use((req, res, next) => {
  res.status(404).render('404', { title: '404 - Not Found' });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('Something went wrong on the server!');
});

if (process.env.NODE_ENV !== 'test' && !process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`EZ Studio server running on http://localhost:${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
  });
}

module.exports = app;
