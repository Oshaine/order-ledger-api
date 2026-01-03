const { MenuItem, MenuItemSize, InventoryItem, Branch } = require('../models');
const { logAudit } = require('../middleware/audit');
const { getBranchFilter } = require('../middleware/auth');
const { Op } = require('sequelize');

const getAllMenuItems = async (req, res) => {
  try {
    const { name, isActive, category } = req.query;
    
    const where = {};
    
    if (name) {
      where.name = {
        [Op.like]: `%${name}%`
      };
    }
    
    if (isActive !== undefined) {
      where.isActive = isActive === 'true';
    }

    // Filter by branch: show items available to all branches (branchId IS NULL) OR items for user's branch
    const branchFilter = getBranchFilter(req.user);
    if (branchFilter !== null && branchFilter !== 'NO_BRANCH') {
      where[Op.or] = [
        { branchId: null }, // Available to all branches
        { branchId: branchFilter } // Available to user's branch
      ];
    } else if (branchFilter === 'NO_BRANCH') {
      // User has no branch and is not admin, only show items available to all branches
      where.branchId = null;
    }

    // Build size where clause
    const sizeWhere = {};
    if (isActive === undefined || isActive === 'true') {
      sizeWhere.isActive = true;
    }

    const menuItems = await MenuItem.findAll({
      where,
      include: [
        {
          model: MenuItemSize,
          as: 'sizes',
          where: Object.keys(sizeWhere).length > 0 ? sizeWhere : {},
          required: false,
          include: [{
            model: InventoryItem,
            as: 'inventoryItem'
          }]
        },
        {
          model: Branch,
          as: 'branch',
          attributes: ['id', 'name'],
          required: false
        }
      ],
      order: [['name', 'ASC']]
    });

    res.json(menuItems);
  } catch (error) {
    console.error('Get menu items error:', error);
    res.status(500).json({ error: 'Failed to fetch menu items' });
  }
};

const getMenuItemById = async (req, res) => {
  try {
    const menuItem = await MenuItem.findByPk(req.params.id, {
      include: [
        {
          model: MenuItemSize,
          as: 'sizes',
          include: [{
            model: InventoryItem,
            as: 'inventoryItem'
          }]
        },
        {
          model: Branch,
          as: 'branch',
          attributes: ['id', 'name'],
          required: false
        }
      ]
    });

    if (!menuItem) {
      return res.status(404).json({ error: 'Menu item not found' });
    }

    // Check branch access: show items available to all branches (branchId IS NULL) OR items for user's branch
    const branchFilter = getBranchFilter(req.user);
    if (branchFilter !== null && branchFilter !== 'NO_BRANCH') {
      if (menuItem.branchId !== null && menuItem.branchId !== branchFilter) {
        return res.status(403).json({ error: 'Access denied' });
      }
    } else if (branchFilter === 'NO_BRANCH') {
      // User has no branch and is not admin, only show items available to all branches
      if (menuItem.branchId !== null) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    res.json(menuItem);
  } catch (error) {
    console.error('Get menu item error:', error);
    res.status(500).json({ error: 'Failed to fetch menu item' });
  }
};

const createMenuItem = async (req, res) => {
  try {
    let { name, description, sizes, branchId } = req.body;
    const userRole = req.user.role?.name;

    // Parse sizes if it's a JSON string (happens with multipart/form-data)
    if (typeof sizes === 'string') {
      try {
        sizes = JSON.parse(sizes);
      } catch (e) {
        return res.status(400).json({ error: 'Invalid sizes format' });
      }
    }

    if (!name || !sizes || sizes.length === 0) {
      return res.status(400).json({ error: 'Name and at least one size required' });
    }

    // Handle branchId:
    // - admin can set any branchId or null (null = available to all branches)
    // - branch_admin can only set null or their own branchId
    // - other roles cannot create menu items (should be blocked by route authorization)
    let finalBranchId = null;
    if (userRole === 'admin') {
      // Admin can set branchId to any value or null
      finalBranchId = branchId === '' || branchId === null ? null : branchId;
    } else if (userRole === 'branch_admin') {
      // Branch admin can only set null (all branches) or their own branchId
      if (branchId && branchId !== req.user.branchId) {
        return res.status(403).json({ error: 'Branch admin can only create menu items for their own branch or make them available to all branches' });
      }
      finalBranchId = branchId === '' || branchId === null ? null : req.user.branchId;
    }

    // Get image path if uploaded
    const imagePath = req.file ? `/uploads/menu-items/${req.file.filename}` : null;

    const menuItem = await MenuItem.create({
      name,
      description: description || null,
      image: imagePath,
      branchId: finalBranchId,
      isActive: true
    });

    // Create sizes and validate inventory items belong to correct branch
    // Determine the expected branchId for inventory items:
    // - If menu item is branch-specific (finalBranchId is set), inventory items must match
    // - If menu item is available to all branches (finalBranchId is null), inventory items should be from the creator's branch
    const expectedInventoryBranchId = finalBranchId || req.user.branchId;
    
    for (const size of sizes) {
      if (size.inventoryItemId) {
        const inventoryItem = await InventoryItem.findByPk(size.inventoryItemId);
        if (!inventoryItem) {
          // Rollback menu item creation
          await menuItem.destroy();
          return res.status(400).json({ error: `Inventory item not found: ${size.inventoryItemId}` });
        }
        
        // Validate inventory item branch
        if (inventoryItem.branchId !== expectedInventoryBranchId) {
          await menuItem.destroy();
          return res.status(400).json({ error: `Inventory item belongs to a different branch. Expected branch: ${expectedInventoryBranchId}, found: ${inventoryItem.branchId}` });
        }
      }
      
      await MenuItemSize.create({
        menuItemId: menuItem.id,
        size: size.size,
        price: size.price,
        inventoryItemId: size.inventoryItemId,
        isActive: true
      });
    }

    await logAudit(req, 'CREATE_MENU_ITEM', 'MenuItem', menuItem.id, { name });

    const menuItemWithSizes = await MenuItem.findByPk(menuItem.id, {
      include: [
        {
          model: MenuItemSize,
          as: 'sizes',
          include: [{
            model: InventoryItem,
            as: 'inventoryItem'
          }]
        },
        {
          model: Branch,
          as: 'branch',
          attributes: ['id', 'name'],
          required: false
        }
      ]
    });

    res.status(201).json(menuItemWithSizes);
  } catch (error) {
    console.error('Create menu item error:', error);
    res.status(500).json({ error: 'Failed to create menu item' });
  }
};

const updateMenuItem = async (req, res) => {
  try {
    const menuItem = await MenuItem.findByPk(req.params.id);
    if (!menuItem) {
      return res.status(404).json({ error: 'Menu item not found' });
    }

    // Check branch access for branch_admin
    const userRole = req.user.role?.name;
    if (userRole === 'branch_admin') {
      // Branch admin can only update items for their branch or items available to all branches
      if (menuItem.branchId && menuItem.branchId !== req.user.branchId) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    const { name, description, isActive, branchId } = req.body;

    if (name) menuItem.name = name;
    if (description !== undefined) menuItem.description = description;
    if (isActive !== undefined) menuItem.isActive = isActive;

    // Update branchId (only admin can change this)
    if (branchId !== undefined && userRole === 'admin') {
      menuItem.branchId = branchId === '' || branchId === null ? null : branchId;
    } else if (userRole === 'branch_admin') {
      // Branch admin can only set to null (all branches) or their own branchId
      if (branchId !== undefined) {
        if (branchId && branchId !== req.user.branchId) {
          return res.status(403).json({ error: 'Branch admin can only set menu item to their own branch or make it available to all branches' });
        }
        menuItem.branchId = branchId === '' || branchId === null ? null : req.user.branchId;
      }
    }

    // Update image if new one uploaded
    if (req.file) {
      // Delete old image if exists
      if (menuItem.image) {
        const fs = require('fs');
        const oldImagePath = menuItem.image.replace('/uploads', 'uploads');
        if (fs.existsSync(oldImagePath)) {
          fs.unlinkSync(oldImagePath);
        }
      }
      menuItem.image = `/uploads/menu-items/${req.file.filename}`;
    }

    await menuItem.save();

    await logAudit(req, 'UPDATE_MENU_ITEM', 'MenuItem', menuItem.id, req.body);

    const menuItemWithSizes = await MenuItem.findByPk(menuItem.id, {
      include: [
        {
          model: MenuItemSize,
          as: 'sizes',
          include: [{
            model: InventoryItem,
            as: 'inventoryItem'
          }]
        },
        {
          model: Branch,
          as: 'branch',
          attributes: ['id', 'name'],
          required: false
        }
      ]
    });

    res.json(menuItemWithSizes);
  } catch (error) {
    console.error('Update menu item error:', error);
    res.status(500).json({ error: 'Failed to update menu item' });
  }
};

const updateMenuItemSize = async (req, res) => {
  try {
    const size = await MenuItemSize.findByPk(req.params.sizeId);
    if (!size || size.menuItemId !== req.params.id) {
      return res.status(404).json({ error: 'Menu item size not found' });
    }

    const { price, isActive } = req.body;

    if (price !== undefined) size.price = price;
    if (isActive !== undefined) size.isActive = isActive;

    await size.save();

    await logAudit(req, 'UPDATE_MENU_ITEM_SIZE', 'MenuItemSize', size.id, req.body);

    res.json(size);
  } catch (error) {
    console.error('Update menu item size error:', error);
    res.status(500).json({ error: 'Failed to update menu item size' });
  }
};

module.exports = {
  getAllMenuItems,
  getMenuItemById,
  createMenuItem,
  updateMenuItem,
  updateMenuItemSize
};
