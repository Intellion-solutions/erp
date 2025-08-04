const express = require('express');
const { PrismaClient } = require('@prisma/client');
const moment = require('moment');

const router = express.Router();
const prisma = new PrismaClient();

// Middleware to check if user is authenticated
const authenticateToken = require('../middleware/auth');

// Dashboard analytics
router.get('/dashboard', authenticateToken, async (req, res) => {
  try {
    const { period = '30' } = req.query; // days
    const startDate = moment().subtract(parseInt(period), 'days').toDate();
    const endDate = new Date();

    // Get sales data
    const sales = await prisma.sale.findMany({
      where: {
        createdAt: {
          gte: startDate,
          lte: endDate
        }
      },
      select: {
        total: true,
        subtotal: true,
        taxAmount: true,
        discountAmount: true,
        createdAt: true,
        paymentMethod: true,
        paymentStatus: true
      }
    });

    // Get product data
    const products = await prisma.product.findMany({
      select: {
        currentStock: true,
        price: true,
        cost: true,
        status: true
      }
    });

    // Get customer data
    const customers = await prisma.customer.count({
      where: {
        createdAt: {
          gte: startDate
        }
      }
    });

    // Calculate metrics
    const totalSales = sales.reduce((sum, sale) => sum + parseFloat(sale.total), 0);
    const totalRevenue = sales.reduce((sum, sale) => sum + parseFloat(sale.subtotal), 0);
    const totalTax = sales.reduce((sum, sale) => sum + parseFloat(sale.taxAmount), 0);
    const totalDiscount = sales.reduce((sum, sale) => sum + parseFloat(sale.discountAmount), 0);
    const completedSales = sales.filter(sale => sale.paymentStatus === 'COMPLETED');
    const pendingSales = sales.filter(sale => sale.paymentStatus === 'PENDING');

    // Inventory valuation
    const inventoryValue = products.reduce((sum, product) => 
      sum + (parseFloat(product.currentStock) * parseFloat(product.cost)), 0
    );

    // Low stock products
    const lowStockProducts = products.filter(product => 
      product.currentStock <= 10 && product.status === 'ACTIVE'
    ).length;

    // Payment method breakdown
    const paymentMethods = {};
    sales.forEach(sale => {
      paymentMethods[sale.paymentMethod] = (paymentMethods[sale.paymentMethod] || 0) + 1;
    });

    // Daily sales trend
    const dailySales = {};
    sales.forEach(sale => {
      const date = moment(sale.createdAt).format('YYYY-MM-DD');
      dailySales[date] = (dailySales[date] || 0) + parseFloat(sale.total);
    });

    res.json({
      period: parseInt(period),
      metrics: {
        totalSales,
        totalRevenue,
        totalTax,
        totalDiscount,
        completedSales: completedSales.length,
        pendingSales: pendingSales.length,
        averageOrderValue: completedSales.length > 0 ? totalSales / completedSales.length : 0,
        newCustomers: customers,
        inventoryValue,
        lowStockProducts
      },
      paymentMethods,
      dailySales: Object.entries(dailySales).map(([date, amount]) => ({
        date,
        amount
      }))
    });
  } catch (error) {
    console.error('Error fetching dashboard analytics:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard analytics' });
  }
});

// Sales analytics
router.get('/sales', authenticateToken, async (req, res) => {
  try {
    const { 
      startDate, 
      endDate, 
      groupBy = 'day',
      locationId,
      userId 
    } = req.query;

    const where = {};
    
    if (startDate && endDate) {
      where.createdAt = {
        gte: new Date(startDate),
        lte: new Date(endDate)
      };
    }
    
    if (locationId) {
      where.locationId = locationId;
    }
    
    if (userId) {
      where.userId = userId;
    }

    const sales = await prisma.sale.findMany({
      where,
      include: {
        items: {
          include: {
            product: {
              include: {
                category: true
              }
            }
          }
        },
        customer: true,
        user: {
          select: {
            firstName: true,
            lastName: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    // Group sales by date
    const groupedSales = {};
    sales.forEach(sale => {
      let key;
      switch (groupBy) {
        case 'hour':
          key = moment(sale.createdAt).format('YYYY-MM-DD HH');
          break;
        case 'day':
          key = moment(sale.createdAt).format('YYYY-MM-DD');
          break;
        case 'week':
          key = moment(sale.createdAt).format('YYYY-[W]WW');
          break;
        case 'month':
          key = moment(sale.createdAt).format('YYYY-MM');
          break;
        default:
          key = moment(sale.createdAt).format('YYYY-MM-DD');
      }
      
      if (!groupedSales[key]) {
        groupedSales[key] = {
          date: key,
          sales: 0,
          revenue: 0,
          orders: 0,
          items: 0
        };
      }
      
      groupedSales[key].sales += parseFloat(sale.total);
      groupedSales[key].revenue += parseFloat(sale.subtotal);
      groupedSales[key].orders += 1;
      groupedSales[key].items += sale.items.reduce((sum, item) => sum + item.quantity, 0);
    });

    // Top products
    const productSales = {};
    sales.forEach(sale => {
      sale.items.forEach(item => {
        const productId = item.product.id;
        if (!productSales[productId]) {
          productSales[productId] = {
            product: item.product,
            quantity: 0,
            revenue: 0
          };
        }
        productSales[productId].quantity += item.quantity;
        productSales[productId].revenue += parseFloat(item.total);
      });
    });

    const topProducts = Object.values(productSales)
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 10);

    // Top customers
    const customerSales = {};
    sales.forEach(sale => {
      if (sale.customer) {
        const customerId = sale.customer.id;
        if (!customerSales[customerId]) {
          customerSales[customerId] = {
            customer: sale.customer,
            orders: 0,
            revenue: 0
          };
        }
        customerSales[customerId].orders += 1;
        customerSales[customerId].revenue += parseFloat(sale.total);
      }
    });

    const topCustomers = Object.values(customerSales)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);

    res.json({
      sales: Object.values(groupedSales),
      topProducts,
      topCustomers,
      summary: {
        totalSales: sales.length,
        totalRevenue: sales.reduce((sum, sale) => sum + parseFloat(sale.total), 0),
        totalItems: sales.reduce((sum, sale) => 
          sum + sale.items.reduce((itemSum, item) => itemSum + item.quantity, 0), 0
        )
      }
    });
  } catch (error) {
    console.error('Error fetching sales analytics:', error);
    res.status(500).json({ error: 'Failed to fetch sales analytics' });
  }
});

// Inventory analytics
router.get('/inventory', authenticateToken, async (req, res) => {
  try {
    const products = await prisma.product.findMany({
      include: {
        category: true,
        supplier: true,
        stockMovements: {
          where: {
            createdAt: {
              gte: moment().subtract(30, 'days').toDate()
            }
          },
          orderBy: { createdAt: 'desc' }
        }
      }
    });

    // Calculate inventory metrics
    const inventoryMetrics = {
      totalProducts: products.length,
      activeProducts: products.filter(p => p.status === 'ACTIVE').length,
      lowStockProducts: products.filter(p => p.currentStock <= p.minStock).length,
      outOfStockProducts: products.filter(p => p.currentStock === 0).length,
      totalValue: products.reduce((sum, p) => 
        sum + (parseFloat(p.currentStock) * parseFloat(p.cost)), 0
      )
    };

    // Category breakdown
    const categoryBreakdown = {};
    products.forEach(product => {
      const categoryName = product.category.name;
      if (!categoryBreakdown[categoryName]) {
        categoryBreakdown[categoryName] = {
          count: 0,
          value: 0
        };
      }
      categoryBreakdown[categoryName].count += 1;
      categoryBreakdown[categoryName].value += parseFloat(product.currentStock) * parseFloat(product.cost);
    });

    // Stock movement analysis
    const stockMovements = await prisma.stockMovement.findMany({
      where: {
        createdAt: {
          gte: moment().subtract(30, 'days').toDate()
        }
      },
      include: {
        product: {
          include: {
            category: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    // Movement by type
    const movementByType = {};
    stockMovements.forEach(movement => {
      movementByType[movement.type] = (movementByType[movement.type] || 0) + movement.quantity;
    });

    res.json({
      metrics: inventoryMetrics,
      categoryBreakdown: Object.entries(categoryBreakdown).map(([name, data]) => ({
        name,
        ...data
      })),
      movementByType,
      lowStockProducts: products
        .filter(p => p.currentStock <= p.minStock)
        .map(p => ({
          id: p.id,
          name: p.name,
          currentStock: p.currentStock,
          minStock: p.minStock,
          category: p.category.name
        }))
    });
  } catch (error) {
    console.error('Error fetching inventory analytics:', error);
    res.status(500).json({ error: 'Failed to fetch inventory analytics' });
  }
});

// Customer analytics
router.get('/customers', authenticateToken, async (req, res) => {
  try {
    const { period = '30' } = req.query;
    const startDate = moment().subtract(parseInt(period), 'days').toDate();

    const customers = await prisma.customer.findMany({
      include: {
        sales: {
          where: {
            createdAt: {
              gte: startDate
            }
          },
          select: {
            total: true,
            createdAt: true
          }
        },
        loyaltyTransactions: {
          where: {
            createdAt: {
              gte: startDate
            }
          }
        }
      }
    });

    // Customer segments
    const segments = {
      new: customers.filter(c => c.sales.length === 0).length,
      returning: customers.filter(c => c.sales.length > 0 && c.sales.length <= 5).length,
      loyal: customers.filter(c => c.sales.length > 5).length
    };

    // Customer value analysis
    const customerValues = customers
      .map(customer => ({
        id: customer.id,
        name: customer.name,
        totalSpent: customer.sales.reduce((sum, sale) => sum + parseFloat(sale.total), 0),
        orderCount: customer.sales.length,
        loyaltyPoints: customer.loyaltyPoints,
        lastPurchase: customer.lastPurchase
      }))
      .sort((a, b) => b.totalSpent - a.totalSpent);

    // Top customers
    const topCustomers = customerValues.slice(0, 10);

    // Customer acquisition trend
    const acquisitionTrend = {};
    customers.forEach(customer => {
      const date = moment(customer.createdAt).format('YYYY-MM-DD');
      acquisitionTrend[date] = (acquisitionTrend[date] || 0) + 1;
    });

    res.json({
      segments,
      topCustomers,
      acquisitionTrend: Object.entries(acquisitionTrend).map(([date, count]) => ({
        date,
        count
      })),
      summary: {
        totalCustomers: customers.length,
        activeCustomers: customers.filter(c => c.isActive).length,
        averageLoyaltyPoints: customers.reduce((sum, c) => sum + c.loyaltyPoints, 0) / customers.length
      }
    });
  } catch (error) {
    console.error('Error fetching customer analytics:', error);
    res.status(500).json({ error: 'Failed to fetch customer analytics' });
  }
});

// Financial analytics
router.get('/financial', authenticateToken, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    const where = {};
    if (startDate && endDate) {
      where.createdAt = {
        gte: new Date(startDate),
        lte: new Date(endDate)
      };
    }

    const sales = await prisma.sale.findMany({
      where,
      select: {
        subtotal: true,
        taxAmount: true,
        discountAmount: true,
        total: true,
        paymentMethod: true,
        paymentStatus: true,
        createdAt: true
      }
    });

    const purchases = await prisma.purchase.findMany({
      where,
      select: {
        total: true,
        status: true,
        createdAt: true
      }
    });

    // Revenue analysis
    const revenue = sales
      .filter(sale => sale.paymentStatus === 'COMPLETED')
      .reduce((sum, sale) => sum + parseFloat(sale.subtotal), 0);

    const costs = purchases
      .filter(purchase => purchase.status === 'CONFIRMED')
      .reduce((sum, purchase) => sum + parseFloat(purchase.total), 0);

    const grossProfit = revenue - costs;
    const grossMargin = revenue > 0 ? (grossProfit / revenue) * 100 : 0;

    // Payment method analysis
    const paymentMethods = {};
    sales.forEach(sale => {
      paymentMethods[sale.paymentMethod] = (paymentMethods[sale.paymentMethod] || 0) + parseFloat(sale.total);
    });

    // Tax analysis
    const totalTax = sales.reduce((sum, sale) => sum + parseFloat(sale.taxAmount), 0);
    const totalDiscount = sales.reduce((sum, sale) => sum + parseFloat(sale.discountAmount), 0);

    res.json({
      revenue,
      costs,
      grossProfit,
      grossMargin,
      totalTax,
      totalDiscount,
      paymentMethods,
      netProfit: grossProfit - totalTax
    });
  } catch (error) {
    console.error('Error fetching financial analytics:', error);
    res.status(500).json({ error: 'Failed to fetch financial analytics' });
  }
});

// Forecasting
router.get('/forecast', authenticateToken, async (req, res) => {
  try {
    const { days = 30 } = req.query;
    
    // Get historical sales data
    const historicalSales = await prisma.sale.findMany({
      where: {
        createdAt: {
          gte: moment().subtract(90, 'days').toDate()
        },
        paymentStatus: 'COMPLETED'
      },
      select: {
        total: true,
        createdAt: true
      },
      orderBy: { createdAt: 'asc' }
    });

    // Simple moving average forecast
    const dailySales = {};
    historicalSales.forEach(sale => {
      const date = moment(sale.createdAt).format('YYYY-MM-DD');
      dailySales[date] = (dailySales[date] || 0) + parseFloat(sale.total);
    });

    const salesArray = Object.values(dailySales);
    const averageDailySales = salesArray.reduce((sum, val) => sum + val, 0) / salesArray.length;

    // Generate forecast
    const forecast = [];
    for (let i = 1; i <= parseInt(days); i++) {
      const date = moment().add(i, 'days').format('YYYY-MM-DD');
      forecast.push({
        date,
        predictedSales: averageDailySales,
        confidence: 0.8
      });
    }

    res.json({
      forecast,
      metrics: {
        averageDailySales,
        totalHistoricalSales: salesArray.length,
        trend: 'stable' // This could be calculated based on linear regression
      }
    });
  } catch (error) {
    console.error('Error generating forecast:', error);
    res.status(500).json({ error: 'Failed to generate forecast' });
  }
});

// Export analytics data
router.get('/export', authenticateToken, async (req, res) => {
  try {
    const { type, startDate, endDate } = req.query;
    
    const where = {};
    if (startDate && endDate) {
      where.createdAt = {
        gte: new Date(startDate),
        lte: new Date(endDate)
      };
    }

    let data;
    let filename;

    switch (type) {
      case 'sales':
        data = await prisma.sale.findMany({
          where,
          include: {
            customer: true,
            user: true,
            items: {
              include: {
                product: true
              }
            }
          }
        });
        filename = `sales_${moment().format('YYYY-MM-DD')}.json`;
        break;
      
      case 'customers':
        data = await prisma.customer.findMany({
          include: {
            sales: true,
            loyaltyTransactions: true
          }
        });
        filename = `customers_${moment().format('YYYY-MM-DD')}.json`;
        break;
      
      case 'products':
        data = await prisma.product.findMany({
          include: {
            category: true,
            supplier: true,
            stockMovements: true
          }
        });
        filename = `products_${moment().format('YYYY-MM-DD')}.json`;
        break;
      
      default:
        return res.status(400).json({ error: 'Invalid export type' });
    }

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.json(data);
  } catch (error) {
    console.error('Error exporting analytics data:', error);
    res.status(500).json({ error: 'Failed to export data' });
  }
});

module.exports = router;