const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { logger } = require('../utils/logger');

const router = express.Router();
const prisma = new PrismaClient();

// Get sales report
router.get('/sales', authenticateToken, async (req, res) => {
  try {
    const { startDate, endDate, groupBy = 'day' } = req.query;

    const where = {};
    if (startDate && endDate) {
      where.createdAt = {
        gte: new Date(startDate),
        lte: new Date(endDate)
      };
    }

    const sales = await prisma.sale.findMany({
      where,
      include: {
        customer: true,
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true
          }
        },
        items: {
          include: {
            product: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    // Calculate totals
    const totalSales = sales.length;
    const totalRevenue = sales.reduce((sum, sale) => sum + parseFloat(sale.total), 0);
    const totalTax = sales.reduce((sum, sale) => sum + parseFloat(sale.taxAmount), 0);
    const totalDiscount = sales.reduce((sum, sale) => sum + parseFloat(sale.discountAmount), 0);

    // Group by date if requested
    let groupedData = {};
    if (groupBy === 'day') {
      sales.forEach(sale => {
        const date = sale.createdAt.toISOString().split('T')[0];
        if (!groupedData[date]) {
          groupedData[date] = {
            date,
            sales: 0,
            revenue: 0,
            tax: 0,
            discount: 0
          };
        }
        groupedData[date].sales++;
        groupedData[date].revenue += parseFloat(sale.total);
        groupedData[date].tax += parseFloat(sale.taxAmount);
        groupedData[date].discount += parseFloat(sale.discountAmount);
      });
    }

    const report = {
      period: { startDate, endDate },
      summary: {
        totalSales,
        totalRevenue,
        totalTax,
        totalDiscount,
        netRevenue: totalRevenue - totalDiscount
      },
      sales,
      groupedData: Object.values(groupedData)
    };

    res.json(report);
  } catch (error) {
    logger.error('Error generating sales report:', error);
    res.status(500).json({ error: 'Failed to generate sales report' });
  }
});

// Get purchase report
router.get('/purchases', authenticateToken, async (req, res) => {
  try {
    const { startDate, endDate, supplierId } = req.query;

    const where = {};
    if (startDate && endDate) {
      where.createdAt = {
        gte: new Date(startDate),
        lte: new Date(endDate)
      };
    }

    if (supplierId) {
      where.supplierId = supplierId;
    }

    const purchases = await prisma.purchase.findMany({
      where,
      include: {
        supplier: true,
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true
          }
        },
        items: {
          include: {
            product: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    // Calculate totals
    const totalPurchases = purchases.length;
    const totalSpent = purchases.reduce((sum, purchase) => sum + parseFloat(purchase.total), 0);
    const totalTax = purchases.reduce((sum, purchase) => sum + parseFloat(purchase.taxAmount), 0);

    // Group by supplier
    const supplierStats = {};
    purchases.forEach(purchase => {
      const supplierName = purchase.supplier.name;
      if (!supplierStats[supplierName]) {
        supplierStats[supplierName] = {
          supplier: purchase.supplier,
          purchases: 0,
          totalSpent: 0
        };
      }
      supplierStats[supplierName].purchases++;
      supplierStats[supplierName].totalSpent += parseFloat(purchase.total);
    });

    const report = {
      period: { startDate, endDate },
      summary: {
        totalPurchases,
        totalSpent,
        totalTax
      },
      purchases,
      supplierStats: Object.values(supplierStats)
    };

    res.json(report);
  } catch (error) {
    logger.error('Error generating purchase report:', error);
    res.status(500).json({ error: 'Failed to generate purchase report' });
  }
});

// Get inventory report
router.get('/inventory', authenticateToken, async (req, res) => {
  try {
    const { categoryId, supplierId, status } = req.query;

    const where = {};
    if (categoryId) {
      where.categoryId = categoryId;
    }
    if (supplierId) {
      where.supplierId = supplierId;
    }
    if (status) {
      where.status = status;
    }

    const products = await prisma.product.findMany({
      where,
      include: {
        category: true,
        supplier: true
      },
      orderBy: { name: 'asc' }
    });

    // Calculate inventory metrics
    const totalProducts = products.length;
    const totalStockItems = products.reduce((sum, product) => sum + product.currentStock, 0);
    const totalCost = products.reduce((sum, product) => sum + (parseFloat(product.cost) * product.currentStock), 0);
    const totalValue = products.reduce((sum, product) => sum + (parseFloat(product.price) * product.currentStock), 0);
    const lowStockProducts = products.filter(product => product.currentStock <= product.minStock);
    const outOfStockProducts = products.filter(product => product.currentStock === 0);

    // Group by category
    const categoryStats = {};
    products.forEach(product => {
      const categoryName = product.category?.name || 'Uncategorized';
      if (!categoryStats[categoryName]) {
        categoryStats[categoryName] = {
          category: product.category,
          products: 0,
          totalStock: 0,
          totalValue: 0
        };
      }
      categoryStats[categoryName].products++;
      categoryStats[categoryName].totalStock += product.currentStock;
      categoryStats[categoryName].totalValue += parseFloat(product.price) * product.currentStock;
    });

    const report = {
      summary: {
        totalProducts,
        totalStockItems,
        totalCost,
        totalValue,
        grossProfit: totalValue - totalCost,
        lowStockProducts: lowStockProducts.length,
        outOfStockProducts: outOfStockProducts.length
      },
      products,
      categoryStats: Object.values(categoryStats),
      lowStockProducts,
      outOfStockProducts
    };

    res.json(report);
  } catch (error) {
    logger.error('Error generating inventory report:', error);
    res.status(500).json({ error: 'Failed to generate inventory report' });
  }
});

// Get customer report
router.get('/customers', authenticateToken, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const where = {};
    if (startDate && endDate) {
      where.createdAt = {
        gte: new Date(startDate),
        lte: new Date(endDate)
      };
    }

    const customers = await prisma.customer.findMany({
      where,
      include: {
        sales: {
          where: startDate && endDate ? {
            createdAt: {
              gte: new Date(startDate),
              lte: new Date(endDate)
            }
          } : undefined,
          include: {
            items: true
          }
        }
      },
      orderBy: { name: 'asc' }
    });

    // Calculate customer metrics
    const totalCustomers = customers.length;
    const activeCustomers = customers.filter(customer => customer.sales.length > 0);
    const totalRevenue = customers.reduce((sum, customer) => {
      return sum + customer.sales.reduce((saleSum, sale) => saleSum + parseFloat(sale.total), 0);
    }, 0);

    // Top customers by revenue
    const topCustomers = customers
      .map(customer => ({
        ...customer,
        totalSpent: customer.sales.reduce((sum, sale) => sum + parseFloat(sale.total), 0),
        totalOrders: customer.sales.length
      }))
      .sort((a, b) => b.totalSpent - a.totalSpent)
      .slice(0, 10);

    const report = {
      period: { startDate, endDate },
      summary: {
        totalCustomers,
        activeCustomers: activeCustomers.length,
        inactiveCustomers: totalCustomers - activeCustomers.length,
        totalRevenue
      },
      customers,
      topCustomers
    };

    res.json(report);
  } catch (error) {
    logger.error('Error generating customer report:', error);
    res.status(500).json({ error: 'Failed to generate customer report' });
  }
});

// Get supplier report
router.get('/suppliers', authenticateToken, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const where = {};
    if (startDate && endDate) {
      where.createdAt = {
        gte: new Date(startDate),
        lte: new Date(endDate)
      };
    }

    const suppliers = await prisma.supplier.findMany({
      where,
      include: {
        purchases: {
          where: startDate && endDate ? {
            createdAt: {
              gte: new Date(startDate),
              lte: new Date(endDate)
            }
          } : undefined,
          include: {
            items: true
          }
        },
        products: true
      },
      orderBy: { name: 'asc' }
    });

    // Calculate supplier metrics
    const totalSuppliers = suppliers.length;
    const activeSuppliers = suppliers.filter(supplier => supplier.purchases.length > 0);
    const totalSpent = suppliers.reduce((sum, supplier) => {
      return sum + supplier.purchases.reduce((purchaseSum, purchase) => purchaseSum + parseFloat(purchase.total), 0);
    }, 0);

    // Top suppliers by spending
    const topSuppliers = suppliers
      .map(supplier => ({
        ...supplier,
        totalSpent: supplier.purchases.reduce((sum, purchase) => sum + parseFloat(purchase.total), 0),
        totalOrders: supplier.purchases.length,
        totalProducts: supplier.products.length
      }))
      .sort((a, b) => b.totalSpent - a.totalSpent)
      .slice(0, 10);

    const report = {
      period: { startDate, endDate },
      summary: {
        totalSuppliers,
        activeSuppliers: activeSuppliers.length,
        inactiveSuppliers: totalSuppliers - activeSuppliers.length,
        totalSpent
      },
      suppliers,
      topSuppliers
    };

    res.json(report);
  } catch (error) {
    logger.error('Error generating supplier report:', error);
    res.status(500).json({ error: 'Failed to generate supplier report' });
  }
});

// Get profit and loss report
router.get('/profit-loss', authenticateToken, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const where = {};
    if (startDate && endDate) {
      where.createdAt = {
        gte: new Date(startDate),
        lte: new Date(endDate)
      };
    }

    const [sales, purchases] = await Promise.all([
      prisma.sale.findMany({
        where,
        include: {
          items: {
            include: {
              product: true
            }
          }
        }
      }),
      prisma.purchase.findMany({
        where,
        include: {
          items: {
            include: {
              product: true
            }
          }
        }
      })
    ]);

    // Calculate revenue
    const totalRevenue = sales.reduce((sum, sale) => sum + parseFloat(sale.total), 0);
    const totalDiscount = sales.reduce((sum, sale) => sum + parseFloat(sale.discountAmount), 0);
    const netRevenue = totalRevenue - totalDiscount;

    // Calculate cost of goods sold
    const costOfGoodsSold = sales.reduce((sum, sale) => {
      return sum + sale.items.reduce((itemSum, item) => {
        return itemSum + (parseFloat(item.product.cost) * item.quantity);
      }, 0);
    }, 0);

    // Calculate gross profit
    const grossProfit = netRevenue - costOfGoodsSold;

    // Calculate expenses (purchases)
    const totalExpenses = purchases.reduce((sum, purchase) => sum + parseFloat(purchase.total), 0);

    // Calculate net profit
    const netProfit = grossProfit - totalExpenses;

    const report = {
      period: { startDate, endDate },
      revenue: {
        totalRevenue,
        totalDiscount,
        netRevenue
      },
      costOfGoodsSold,
      grossProfit,
      expenses: {
        totalExpenses
      },
      netProfit,
      profitMargin: netRevenue > 0 ? (netProfit / netRevenue) * 100 : 0
    };

    res.json(report);
  } catch (error) {
    logger.error('Error generating profit and loss report:', error);
    res.status(500).json({ error: 'Failed to generate profit and loss report' });
  }
});

// Export report to CSV
router.get('/export/:type', authenticateToken, async (req, res) => {
  try {
    const { type } = req.params;
    const { startDate, endDate, format = 'csv' } = req.query;

    let data = [];
    let filename = '';

    switch (type) {
      case 'sales':
        const sales = await prisma.sale.findMany({
          where: startDate && endDate ? {
            createdAt: {
              gte: new Date(startDate),
              lte: new Date(endDate)
            }
          } : {},
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

        data = sales.map(sale => ({
          'Sale Number': sale.saleNumber,
          'Date': sale.createdAt.toISOString().split('T')[0],
          'Customer': sale.customer?.name || 'Walk-in',
          'Salesperson': `${sale.user.firstName} ${sale.user.lastName}`,
          'Subtotal': sale.subtotal,
          'Tax': sale.taxAmount,
          'Discount': sale.discountAmount,
          'Total': sale.total,
          'Payment Method': sale.paymentMethod,
          'Status': sale.paymentStatus
        }));
        filename = 'sales-report.csv';
        break;

      case 'inventory':
        const products = await prisma.product.findMany({
          include: {
            category: true,
            supplier: true
          }
        });

        data = products.map(product => ({
          'Product Name': product.name,
          'SKU': product.sku,
          'Category': product.category?.name || '',
          'Supplier': product.supplier?.name || '',
          'Current Stock': product.currentStock,
          'Min Stock': product.minStock,
          'Unit Cost': product.cost,
          'Unit Price': product.price,
          'Status': product.status
        }));
        filename = 'inventory-report.csv';
        break;

      default:
        return res.status(400).json({ error: 'Invalid report type' });
    }

    if (format === 'csv') {
      const csvHeaders = Object.keys(data[0]);
      const csvContent = [
        csvHeaders.join(','),
        ...data.map(row => csvHeaders.map(header => `"${row[header]}"`).join(','))
      ].join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(csvContent);
    } else {
      res.json(data);
    }
  } catch (error) {
    logger.error('Error exporting report:', error);
    res.status(500).json({ error: 'Failed to export report' });
  }
});

module.exports = router;