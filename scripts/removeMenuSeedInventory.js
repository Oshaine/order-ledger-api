/**
 * Deletes placeholder inventory rows created by older menu seeds:
 *   "Menu seed — Small", "Menu seed — Medium", "Menu seed — Large"
 * Only removes rows that are NOT linked from menu_item_sizes, and deletes their inventory_logs first.
 *
 * Run: CONFIRM=yes node scripts/removeMenuSeedInventory.js
 */
require('dotenv').config();
const { Op } = require('sequelize');
const { sequelize, InventoryItem, InventoryLog, MenuItemSize } = require('../models');
const { normalizeUuid } = require('../utils/branchUuid');

const SEED_NAMES = ['Menu seed — Small', 'Menu seed — Medium', 'Menu seed — Large'];

async function main() {
  const ok = process.env.CONFIRM === 'yes' || process.argv.includes('--yes');
  if (!ok) {
    console.error('Refusing to run. Set CONFIRM=yes or pass --yes');
    process.exit(1);
  }

  await sequelize.authenticate();

  const usedRows = await MenuItemSize.findAll({ attributes: ['inventoryItemId'], raw: true });
  const used = new Set(usedRows.map((r) => normalizeUuid(r.inventoryItemId)).filter(Boolean));

  const candidates = await InventoryItem.findAll({
    where: { name: { [Op.in]: SEED_NAMES } }
  });

  const toRemove = candidates.filter((c) => !used.has(normalizeUuid(c.id)));
  if (toRemove.length === 0) {
    console.log('No unlinked Menu seed — * inventory rows to delete.');
    await sequelize.close();
    return;
  }

  const ids = toRemove.map((r) => r.id);
  const t = await sequelize.transaction();
  try {
    const nLogs = await InventoryLog.destroy({ where: { inventoryItemId: { [Op.in]: ids } }, transaction: t });
    const nInv = await InventoryItem.destroy({ where: { id: { [Op.in]: ids } }, transaction: t });
    await t.commit();
    console.log(`Removed ${nInv} inventory item(s), ${nLogs} inventory log row(s).`);
    toRemove.forEach((r) => console.log(`  - ${r.name} (${r.id})`));
  } catch (e) {
    await t.rollback();
    console.error(e);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

main();
