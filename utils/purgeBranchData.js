const { Op } = require('sequelize');
const {
  User,
  Sale,
  SaleItem,
  Payment,
  CashDenomination,
  Delivery,
  InventoryItem,
  InventoryLog,
  Shift,
  MenuItem,
  MenuItemSize,
  Branch
} = require('../models');

/**
 * Moves users to keepBranchId, deletes sales/inventory/shifts scoped to branchIdToRemove,
 * sets branch-specific menu items to global (branchId null), then deletes the branch row.
 * Caller must pass an open Sequelize transaction and commit/rollback.
 */
async function purgeBranchIntoKeep(branchIdToRemove, keepBranchId, transaction) {
  const remove = String(branchIdToRemove).trim();
  const keep = String(keepBranchId).trim();
  if (!remove || !keep || remove === keep) {
    throw new Error('Invalid branch ids for purge');
  }

  await User.update({ branchId: keep }, { where: { branchId: remove }, transaction });

  const sales = await Sale.findAll({
    where: { branchId: remove },
    attributes: ['id'],
    transaction
  });
  const saleIds = sales.map((s) => s.id);
  if (saleIds.length > 0) {
    const payments = await Payment.findAll({
      where: { saleId: { [Op.in]: saleIds } },
      attributes: ['id'],
      transaction
    });
    const paymentIds = payments.map((p) => p.id);
    if (paymentIds.length > 0) {
      await CashDenomination.destroy({ where: { paymentId: { [Op.in]: paymentIds } }, transaction });
      await Payment.destroy({ where: { id: { [Op.in]: paymentIds } }, transaction });
    }
    await SaleItem.destroy({ where: { saleId: { [Op.in]: saleIds } }, transaction });
    await Delivery.destroy({ where: { saleId: { [Op.in]: saleIds } }, transaction });
    await Sale.destroy({ where: { id: { [Op.in]: saleIds } }, transaction });
  }

  const invRows = await InventoryItem.findAll({
    where: { branchId: remove },
    transaction
  });
  for (const inv of invRows) {
    const replacement = await InventoryItem.findOne({
      where: {
        branchId: keep,
        name: inv.name,
        category: inv.category,
        size: inv.size
      },
      transaction
    });
    if (replacement) {
      await MenuItemSize.update(
        { inventoryItemId: replacement.id },
        { where: { inventoryItemId: inv.id }, transaction }
      );
    }
  }
  const invIds = invRows.map((r) => r.id);
  if (invIds.length > 0) {
    await InventoryLog.destroy({ where: { inventoryItemId: { [Op.in]: invIds } }, transaction });
    await InventoryItem.destroy({ where: { id: { [Op.in]: invIds } }, transaction });
  }

  await Shift.destroy({ where: { branchId: remove }, transaction });

  await MenuItem.update({ branchId: null }, { where: { branchId: remove }, transaction });

  const n = await Branch.destroy({ where: { id: remove }, transaction });
  if (n === 0) {
    throw new Error('Branch row was not deleted');
  }
}

module.exports = { purgeBranchIntoKeep };
