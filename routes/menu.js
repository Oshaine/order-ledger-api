const express = require('express');
const router = express.Router();
const menuController = require('../controllers/menuController');
const { authenticateToken, authorize } = require('../middleware/auth');
const upload = require('../middleware/upload');

router.get('/', authenticateToken, menuController.getAllMenuItems);
router.get('/:id', authenticateToken, menuController.getMenuItemById);
router.post('/', authenticateToken, authorize('admin', 'branch_admin'), upload.single('image'), menuController.createMenuItem);
router.put('/:id', authenticateToken, authorize('admin', 'branch_admin'), upload.single('image'), menuController.updateMenuItem);
router.put('/:id/sizes/:sizeId', authenticateToken, authorize('admin', 'branch_admin'), menuController.updateMenuItemSize);

module.exports = router;