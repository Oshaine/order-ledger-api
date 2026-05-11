const { Buffer } = require('buffer');

/**
 * Normalize branch/user UUIDs for comparisons and Sequelize where clauses.
 * MySQL may return BINARY(16) as Buffer; JWT / app code uses dashed strings.
 */
function normalizeUuid(id) {
  if (id == null || id === '') return null;
  if (Buffer.isBuffer(id)) {
    if (id.length === 16) {
      const hex = id.toString('hex');
      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`.toLowerCase();
    }
    const s = id.toString('utf8').trim();
    return s ? s.toLowerCase() : null;
  }
  return String(id).trim().toLowerCase();
}

function sameUuid(a, b) {
  return normalizeUuid(a) === normalizeUuid(b);
}

module.exports = { normalizeUuid, sameUuid };
