const { Sale, SaleItem, Payment, User, MenuItemSize, MenuItem, sequelize } = require('../models');
const { Op } = require('sequelize');
const Sequelize = require('sequelize');

const { getBranchFilter } = require('../middleware/auth');

const getDashboardStats = async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Build where clause for branch filtering
    const where = {
      createdAt: {
        [Op.gte]: today,
        [Op.lt]: tomorrow
      },
      status: 'completed'
    };

    // Filter by branch based on user role
    const branchFilter = getBranchFilter(req.user);
    if (branchFilter !== null && branchFilter !== 'NO_BRANCH') {
      where.branchId = branchFilter;
    } else if (branchFilter === 'NO_BRANCH') {
      // User has no branch and is not admin, return empty stats
      return res.json({
        totalSalesToday: 0,
        cashTotal: 0,
        cardTotal: 0,
        cashierSales: [],
        topItems: []
      });
    }

    // If user is cashier, filter by their sales
    if (req.user.role?.name === 'cashier') {
      where.cashierId = req.user.id;
    }

    // Total sales today (include cashier association)
    const todaySales = await Sale.findAll({ 
      where,
      include: [{ model: User, as: 'cashier', attributes: ['id', 'fullName', 'username'] }]
    });

    const totalSalesToday = todaySales.reduce((sum, sale) => sum + parseFloat(sale.totalAmount), 0);

    // Cash vs Card totals
    const paymentWhere = {
      createdAt: {
        [Op.gte]: today,
        [Op.lt]: tomorrow
      }
    };
    const payments = await Payment.findAll({
      where: paymentWhere,
      include: [{
        model: Sale,
        as: 'sale',
        where: branchFilter !== null && branchFilter !== 'NO_BRANCH' 
          ? { status: 'completed', branchId: branchFilter }
          : { status: 'completed' }
      }]
    });

    const cashTotal = payments
      .filter(p => p.method === 'cash')
      .reduce((sum, p) => sum + parseFloat(p.amount), 0);

    const cardTotal = payments
      .filter(p => p.method === 'card')
      .reduce((sum, p) => sum + parseFloat(p.amount), 0);

    // Calculate totals per cashier manually
    const cashierSalesMap = {};
    todaySales.forEach(sale => {
      if (!cashierSalesMap[sale.cashierId]) {
        cashierSalesMap[sale.cashierId] = {
          cashierId: sale.cashierId,
          total: 0,
          cashier: sale.cashier || null
        };
      }
      cashierSalesMap[sale.cashierId].total += parseFloat(sale.totalAmount);
    });

    // Top selling items - use the same branch filter
    const saleItemWhere = {
      status: 'completed',
      createdAt: {
        [Op.gte]: today,
        [Op.lt]: tomorrow
      }
    };
    if (branchFilter !== null && branchFilter !== 'NO_BRANCH') {
      saleItemWhere.branchId = branchFilter;
    }
    if (req.user.role?.name === 'cashier') {
      saleItemWhere.cashierId = req.user.id;
    }
    const saleItems = await SaleItem.findAll({
      include: [{
        model: Sale,
        as: 'sale',
        where: saleItemWhere,
        required: true
      }, {
        model: MenuItemSize,
        as: 'menuItemSize',
        include: [{ model: MenuItem, as: 'menuItem' }]
      }]
    });

    // Group by menuItemSizeId
    const itemSalesMap = {};
    saleItems.forEach(item => {
      const sizeId = item.menuItemSizeId;
      if (!itemSalesMap[sizeId]) {
        itemSalesMap[sizeId] = {
          menuItemSizeId: sizeId,
          totalQuantity: 0,
          totalRevenue: 0,
          menuItemSize: item.menuItemSize
        };
      }
      itemSalesMap[sizeId].totalQuantity += item.quantity;
      itemSalesMap[sizeId].totalRevenue += parseFloat(item.totalPrice);
    });

    const topItems = Object.values(itemSalesMap)
      .sort((a, b) => b.totalQuantity - a.totalQuantity)
      .slice(0, 10);

    res.json({
      totalSalesToday,
      cashTotal,
      cardTotal,
      cashierSales: Object.values(cashierSalesMap),
      topItems
    });
  } catch (error) {
    console.error('Get dashboard stats error:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard stats' });
  }
};

const getSalesReport = async (req, res) => {
  try {
    const { startDate, endDate, period = 'daily', cashierId, branchId } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'Start date and end date required' });
    }

    // Set start to beginning of day and end to end of day (in UTC to avoid timezone issues)
    const start = new Date(startDate + 'T00:00:00.000Z');
    const end = new Date(endDate + 'T23:59:59.999Z');

    // Filter by branch based on user role
    const branchFilter = getBranchFilter(req.user);
    
    // Build where clause with branch filtering
    const whereClause = {
      createdAt: {
        [Op.between]: [start, end]
      },
      status: 'completed'
    };

    // Allow admin to filter by specific branchId if provided
    if (req.user.role?.name === 'admin' && branchId) {
      whereClause.branchId = branchId;
    } else if (branchFilter !== null && branchFilter !== 'NO_BRANCH') {
      whereClause.branchId = branchFilter;
    } else if (branchFilter === 'NO_BRANCH') {
      return res.json([]);
    }

    // If user is cashier, filter by their ID
    const userId = req.user.id;
    const userRole = req.user.role?.name;
    console.log('User role:', userRole, 'User ID:', userId);
    const filterCashierId = cashierId || (userRole === 'cashier' ? userId : null);
    if (filterCashierId) {
      whereClause.cashierId = filterCashierId;
    }
    console.log('Filter cashier ID:', filterCashierId);

    let groupBy;
    let periodFormatter;
    if (period === 'daily') {
      groupBy = Sequelize.fn('DATE', Sequelize.col('Sale.createdAt'));
      periodFormatter = (p) => {
        if (typeof p === 'string') return p;
        if (p instanceof Date) return p.toISOString().split('T')[0];
        return p ? p.toString() : '';
      };
    } else if (period === 'weekly') {
      // Use DATE_FORMAT to get YYYY-WW format for better readability
      groupBy = Sequelize.fn('DATE_FORMAT', Sequelize.col('Sale.createdAt'), '%Y-%u');
      periodFormatter = (p) => {
        if (!p) return '';
        const str = p.toString();
        // Format: YYYY-WW (e.g., 2025-52)
        return str;
      };
    } else if (period === 'monthly') {
      groupBy = Sequelize.fn('DATE_FORMAT', Sequelize.col('Sale.createdAt'), '%Y-%m');
      periodFormatter = (p) => {
        if (!p) return '';
        const str = p.toString();
        // Format: YYYY-MM (e.g., 2025-12)
        return str;
      };
    } else {
      groupBy = Sequelize.fn('DATE', Sequelize.col('Sale.createdAt'));
      periodFormatter = (p) => {
        if (typeof p === 'string') return p;
        if (p instanceof Date) return p.toISOString().split('T')[0];
        return p ? p.toString() : '';
      };
    }

    console.log('Period type:', period);
    console.log('Start date string:', startDate);
    console.log('End date string:', endDate);
    console.log('Date range (UTC):', start.toISOString(), 'to', end.toISOString());
    console.log('Date range (local):', start.toString(), 'to', end.toString());
    
    // Debug: Check if there are ANY sales for this cashier (without date filter)
    const allSalesForCashier = await Sale.count({
      where: {
        cashierId: filterCashierId,
        status: 'completed'
      }
    });
    console.log(`Total completed sales for cashier ${filterCashierId}:`, allSalesForCashier);
    
    // Debug: Get a sample sale to see what dates exist
    const sampleSale = await Sale.findOne({
      where: {
        cashierId: filterCashierId,
        status: 'completed'
      },
      order: [['createdAt', 'DESC']],
      limit: 1
    });
    if (sampleSale) {
      console.log('Sample sale date:', sampleSale.createdAt);
      console.log('Sample sale date (ISO):', sampleSale.createdAt.toISOString());
    }

    // For GROUP BY with aliases, we need to use the actual SQL expression
    let groupByExpression;
    let orderByExpression;
    if (period === 'daily') {
      groupByExpression = sequelize.literal('DATE(`Sale`.`createdAt`)');
      orderByExpression = sequelize.literal('DATE(`Sale`.`createdAt`)');
    } else if (period === 'weekly') {
      groupByExpression = sequelize.literal('DATE_FORMAT(`Sale`.`createdAt`, "%Y-%u")');
      orderByExpression = sequelize.literal('DATE_FORMAT(`Sale`.`createdAt`, "%Y-%u")');
    } else if (period === 'monthly') {
      groupByExpression = sequelize.literal('DATE_FORMAT(`Sale`.`createdAt`, "%Y-%m")');
      orderByExpression = sequelize.literal('DATE_FORMAT(`Sale`.`createdAt`, "%Y-%m")');
    } else {
      groupByExpression = sequelize.literal('DATE(`Sale`.`createdAt`)');
      orderByExpression = sequelize.literal('DATE(`Sale`.`createdAt`)');
    }

    const sales = await Sale.findAll({
      where: whereClause,
      attributes: [
        [groupBy, 'period'],
        [sequelize.fn('COUNT', sequelize.col('Sale.id')), 'count'],
        [sequelize.fn('SUM', sequelize.col('Sale.totalAmount')), 'total']
      ],
      group: [groupByExpression],
      order: [[orderByExpression, 'ASC']],
      raw: true
    });

    console.log('Sales report results (raw):', JSON.stringify(sales, null, 2));
    console.log('Number of results:', sales.length);

    // Format the response correctly
    const formattedSales = sales.map(row => {
      const formattedPeriod = periodFormatter(row.period);
      return {
        period: formattedPeriod,
        count: parseInt(row.count) || 0,
        total: parseFloat(row.total) || 0
      };
    });

    console.log('Formatted sales:', JSON.stringify(formattedSales, null, 2));
    res.json(formattedSales);
  } catch (error) {
    console.error('Get sales report error:', error);
    res.status(500).json({ error: 'Failed to fetch sales report' });
  }
};

const getSalesProjection = async (req, res) => {
  try {
    // Get sales for the last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Build where clause with branch filtering
    const projectionWhere = {
      createdAt: {
        [Op.gte]: thirtyDaysAgo
      },
      status: 'completed'
    };

    // Filter by branch based on user role
    const branchFilter = getBranchFilter(req.user);
    if (branchFilter !== null && branchFilter !== 'NO_BRANCH') {
      projectionWhere.branchId = branchFilter;
    } else if (branchFilter === 'NO_BRANCH') {
      return res.json({
        averageDaily: 0,
        projected: 0,
        historicalData: []
      });
    }

    const sales = await Sale.findAll({
      where: projectionWhere
    });

    // Group by date
    const salesByDate = {};
    sales.forEach(sale => {
      const date = sale.createdAt.toISOString().split('T')[0];
      if (!salesByDate[date]) {
        salesByDate[date] = 0;
      }
      salesByDate[date] += parseFloat(sale.totalAmount);
    });

    // Calculate average daily sales
    const dates = Object.keys(salesByDate);
    const totalSales = dates.reduce((sum, date) => sum + salesByDate[date], 0);
    const averageDaily = totalSales / Math.max(dates.length, 1);

    // Format historical data
    const historicalData = dates.map(date => ({
      date,
      total: salesByDate[date]
    })).sort((a, b) => a.date.localeCompare(b.date));

    // Project next 7 days
    const projections = [];
    for (let i = 1; i <= 7; i++) {
      const date = new Date();
      date.setDate(date.getDate() + i);
      projections.push({
        date: date.toISOString().split('T')[0],
        projected: averageDaily
      });
    }

    res.json({
      averageDailySales: averageDaily,
      historicalData,
      projections
    });
  } catch (error) {
    console.error('Get sales projection error:', error);
    res.status(500).json({ error: 'Failed to fetch sales projection' });
  }
};

const exportSalesCSV = async (req, res) => {
  try {
    const { startDate, endDate, cashierId } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'Start date and end date required' });
    }

    // If user is cashier, filter by their ID
    const userId = req.user.id;
    const userRole = req.user.role?.name || req.user.role;
    const filterCashierId = cashierId || (userRole === 'cashier' ? userId : null);

    const { exportSalesToCSV } = require('../utils/csvExport');
    const csv = await exportSalesToCSV(startDate, endDate, filterCashierId);

    const filenamePrefix = filterCashierId ? 'my-sales' : 'sales';
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=${filenamePrefix}-${startDate}-to-${endDate}.csv`);
    res.send(csv);
  } catch (error) {
    console.error('Export sales CSV error:', error);
    res.status(500).json({ error: 'Failed to export sales to CSV' });
  }
};

const exportInventoryCSV = async (req, res) => {
  try {
    const { exportInventoryToCSV } = require('../utils/csvExport');
    const csv = await exportInventoryToCSV();

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=inventory.csv');
    res.send(csv);
  } catch (error) {
    console.error('Export inventory CSV error:', error);
    res.status(500).json({ error: 'Failed to export inventory to CSV' });
  }
};

module.exports = {
  getDashboardStats,
  getSalesReport,
  getSalesProjection,
  exportSalesCSV,
  exportInventoryCSV
};