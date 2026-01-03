const { AuditLog } = require('../models');

const logAudit = async (req, action, entityType = null, entityId = null, details = null) => {
  try {
    await AuditLog.create({
      userId: req.user?.id || null,
      action,
      entityType,
      entityId,
      details: details ? JSON.stringify(details) : null,
      ipAddress: req.ip || req.connection.remoteAddress
    });
  } catch (error) {
    console.error('Audit log error:', error);
  }
};

module.exports = { logAudit };
