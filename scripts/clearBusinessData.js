/**
 * Deletes POS business data: sales (transactions), deliveries tied to sales,
 * menu items + sizes, inventory items + logs. Reports use sales — clearing sales clears report data.
 * Keeps: users, roles, branches, shifts, system settings, audit logs.
 *
 * For full reset + menu reseed + foodbox images + fresh default inventory, use:
 *   CONFIRM_RESET=yes node scripts/resetAndReseedMenu.js
 *
 * Run: CONFIRM_CLEAR=yes node scripts/clearBusinessData.js
 */
require('dotenv').config();
const path = require('path');
const fs = require('fs');
const {
  sequelize,
  CashDenomination,
  Payment,
  SaleItem,
  Delivery,
  Sale,
  MenuItemSize,
  MenuItem,
  InventoryLog,
  InventoryItem
} = require('../models');

function unlinkMenuImages(imagePaths) {
  for (const rel of imagePaths) {
    if (!rel || !rel.startsWith('/uploads')) continue;
    const filePath = path.join(__dirname, '..', rel.replace(/^\//, ''));
    try {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch (e) {
      console.warn('Could not delete file:', filePath, e.message);
    }
  }
}

async function main() {
  const ok = process.env.CONFIRM_CLEAR === 'yes' || process.argv.includes('--yes');
  if (!ok) {
    console.error('Refusing to run. Set CONFIRM_CLEAR=yes or pass --yes');
    process.exit(1);
  }

  await sequelize.authenticate();
  console.log('Connected. Clearing business data...');

  const menuRows = await MenuItem.findAll({ attributes: ['image'] });
  const menuImages = menuRows.map((r) => r.image).filter(Boolean);

  const t = await sequelize.transaction();
  try {
    const deletedCash = await CashDenomination.destroy({ where: {}, transaction: t });
    const deletedPayments = await Payment.destroy({ where: {}, transaction: t });
    const deletedSaleItems = await SaleItem.destroy({ where: {}, transaction: t });
    const deletedDeliveries = await Delivery.destroy({ where: {}, transaction: t });
    const deletedSales = await Sale.destroy({ where: {}, transaction: t });

    const deletedSizes = await MenuItemSize.destroy({ where: {}, transaction: t });
    const deletedMenu = await MenuItem.destroy({ where: {}, transaction: t });
    const deletedInvLogs = await InventoryLog.destroy({ where: {}, transaction: t });
    const deletedInv = await InventoryItem.destroy({ where: {}, transaction: t });

    await t.commit();

    unlinkMenuImages(menuImages);

    console.log('Done.');
    console.log({
      cash_denominations: deletedCash,
      payments: deletedPayments,
      sale_items: deletedSaleItems,
      deliveries: deletedDeliveries,
      sales: deletedSales,
      menu_item_sizes: deletedSizes,
      menu_items: deletedMenu,
      inventory_logs: deletedInvLogs,
      inventory_items: deletedInv
    });
  } catch (e) {
    await t.rollback();
    console.error('Clear failed:', e);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

main();
