/**
 * Audit Logger Middleware & Service
 * Immutable audit trail for all admin actions.
 * Collection: audit_logs — NO delete or update operations ever.
 */
const db = require('../config/firebase');

/**
 * Log an admin action to the immutable audit_logs collection.
 *
 * @param {Object} req         - Express request object (for IP, user agent, admin info)
 * @param {string} action      - Action name, e.g. 'BAN_USER', 'WALLET_ADJUST', 'APPROVE_REFUND'
 * @param {string} targetId    - ID of the affected entity (userId, productId, orderId, etc.)
 * @param {string} targetType  - Type of entity: 'user' | 'product' | 'order' | 'refund' | 'seller' | 'topup'
 * @param {Object} details     - Additional context (amount, reason, old value, new value, etc.)
 * @returns {Promise<string>}  - The generated log document ID
 */
async function logAdminAction(req, action, targetId, targetType, details = {}) {
  try {
    const adminUser = req.session && req.session.user;
    const logEntry = {
      adminId: adminUser ? adminUser.id || adminUser.uid || 'unknown' : 'system',
      adminEmail: adminUser ? adminUser.email || 'unknown' : 'system',
      action: action.toUpperCase(),
      targetId: targetId || null,
      targetType: targetType || null,
      details: {
        ...details,
        reason: req.adminActionReason || details.reason || null,
      },
      ip: req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress || 'unknown',
      userAgent: req.headers['user-agent'] || 'unknown',
      timestamp: new Date().toISOString(),
    };

    const docRef = await db.collection('audit_logs').add(logEntry);
    console.log(`[AUDIT] ${logEntry.action} by ${logEntry.adminEmail} on ${logEntry.targetType}:${logEntry.targetId}`);
    return docRef.id;
  } catch (err) {
    // Audit log failure should NEVER crash the main operation — log to console only
    console.error('[AUDIT ERROR] Failed to write audit log:', err.message);
    return null;
  }
}

/**
 * Express middleware that auto-logs POST/PUT/DELETE admin actions.
 * Attach to routes where you want passive logging (without OTP requirement).
 * For sensitive actions, use requireAdminOtp + logAdminAction in the route handler directly.
 *
 * Usage: router.post('/some-route', auditMiddleware('ACTION_NAME', 'entityType'), handler)
 */
function auditMiddleware(action, targetType) {
  return async (req, res, next) => {
    // Store original json/redirect to intercept response
    const originalJson = res.json.bind(res);
    const originalRedirect = res.redirect.bind(res);

    res.json = async (data) => {
      if (res.statusCode < 400) {
        const targetId = req.params.id || req.params.docId || req.body.id || null;
        await logAdminAction(req, action, targetId, targetType, { body: req.body });
      }
      return originalJson(data);
    };

    res.redirect = async (url) => {
      if (!url.includes('error=')) {
        const targetId = req.params.id || req.params.docId || req.body.id || null;
        await logAdminAction(req, action, targetId, targetType, { redirectTo: url });
      }
      return originalRedirect(url);
    };

    next();
  };
}

module.exports = { logAdminAction, auditMiddleware };
