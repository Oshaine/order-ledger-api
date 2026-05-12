/**
 * Sets inventory_items.currentStock from 9999 → 100 (legacy seed default).
 *
 *   CONFIRM=yes node scripts/capInventoryStock9999to100.js
 */
require('dotenv').config();
const { sequelize, InventoryItem } = require('../models');

async function main() {
  const ok = process.env.CONFIRM === 'yes' || process.argv.includes('--yes');
  if (!ok) {
    console.error('Refusing to run. Set CONFIRM=yes or pass --yes');
    process.exit(1);
  }

  await sequelize.authenticate();
  const [n] = await InventoryItem.update(
    { currentStock: 100 },
    { where: { currentStock: 9999 } }
  );
  console.log(`Updated ${n} inventory row(s) from currentStock 9999 → 100.`);
  await sequelize.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
