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
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session Configuration
const session = require('express-session');
app.use(session({
  secret: process.env.SESSION_SECRET || 'ez-studio-super-secret-key-38472948',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false, // Set to true if deploying over HTTPS
    maxAge: 24 * 60 * 60 * 1000 // 24 Hours
  }
}));

// Expose Session variables to EJS views
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  if (!req.session.cart) {
    req.session.cart = [];
  }
  res.locals.cart = req.session.cart;
  next();
});

// Setup EJS View Engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Serve Static Files
app.use(express.static(path.join(__dirname, 'public')));

// Force-logout check: if admin set forceLogoutAt on a user, invalidate their session
const db = require('./config/firebase');
app.use(async (req, res, next) => {
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

// 404 Handle
app.use((req, res, next) => {
  res.status(404).render('404', { title: '404 - Not Found' });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('Something went wrong on the server!');
});

app.listen(PORT, () => {
  console.log(`EZ Studio server running on http://localhost:${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
});
