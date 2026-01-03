const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { authenticateToken, authorize } = require('../middleware/auth');

router.get('/', authenticateToken, authorize('admin', 'branch_admin'), userController.getAllUsers);
router.get('/roles/list', authenticateToken, authorize('admin', 'branch_admin'), userController.getAllRoles);
router.get('/:id', authenticateToken, authorize('admin', 'branch_admin'), userController.getUserById);
router.post('/', authenticateToken, authorize('admin', 'branch_admin'), userController.createUser);
router.put('/:id', authenticateToken, authorize('admin', 'branch_admin'), userController.updateUser);

module.exports = router;