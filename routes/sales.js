const express = require('express');
const router = express.Router();
const salesController = require('../controllers/salesController');
const { authenticateToken, authorize } = require('../middleware/auth');

router.get('/', authenticateToken, salesController.getAllSales);
router.get('/:id', authenticateToken, salesController.getSaleById);
router.get('/:id/receipt', authenticateToken, salesController.getReceiptData);
router.post('/', authenticateToken, salesController.createSale);
router.put('/:id/cancel', authenticateToken, salesController.cancelSale);
router.delete('/:id', authenticateToken, authorize('admin'), salesController.deleteSale);

module.exports = router;
