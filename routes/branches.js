const express = require('express');
const router = express.Router();
const branchController = require('../controllers/branchController');
const { authenticateToken, authorize } = require('../middleware/auth');

// Branch listing is available to admin and branch_admin (read-only for branch_admin)
router.get('/', authenticateToken, authorize('admin', 'branch_admin'), branchController.getAllBranches);
router.get('/:id', authenticateToken, authorize('admin', 'branch_admin'), branchController.getBranchById);
router.post('/', authenticateToken, authorize('admin'), branchController.createBranch);
router.put('/:id', authenticateToken, authorize('admin'), branchController.updateBranch);
router.delete('/:id', authenticateToken, authorize('admin'), branchController.deleteBranch);

module.exports = router;

