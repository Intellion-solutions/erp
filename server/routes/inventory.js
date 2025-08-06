const express = require('express');
const { body, validationResult } = require('express-validator');
const { PrismaClient } = require('@prisma/client');
const { createAuditLog } = require('../services/auditService');
const settingsService = require('../services/settingsService');

const router = express.Router();
const prisma = new PrismaClient();

// Middleware to check authentication
const authenticateToken = require('../middleware/auth');

// Apply authentication to all routes
router.use(authenticateToken);

// ==================== INVENTORY OVERVIEW ====================

// Get inventory summary
router.get('/summary', async (req, res) => {
  try {
    const { dateFrom, dateTo } = req.query;
    const fromDate = dateFrom ? new Date(dateFrom) : new Date(new Date().setDate(new Date().getDate() - 30));
    const toDate = dateTo ? new Date(dateTo) : new Date();

    // Get inventory settings
    const inventorySettings = await settingsService.getInventorySettings();
    const lowStockThreshold = inventorySettings.lowStockThreshold;

    // Get total products
    const totalProducts = await prisma.product.count({
      where: { status: 'ACTIVE' }
    });

    // Get low stock products using configured threshold
    const lowStockProducts = await prisma.product.count({
      where: {
        status: 'ACTIVE',
        stockQuantity: {
          lte: lowStockThreshold
        }
      }
    });

    // Get out of stock products
    const outOfStockProducts = await prisma.product.count({
      where: {
        status: 'ACTIVE',
        stockQuantity: 0
      }
    });

    // Get total inventory value
    const products = await prisma.product.findMany({
      where: { status: 'ACTIVE' },
      select: {
        stockQuantity: true,
        costPrice: true
      }
    });

    const totalValue = products.reduce((sum, product) => {
      return sum + (parseFloat(product.stockQuantity) * parseFloat(product.costPrice));
    }, 0);

    // Get recent stock movements
    const recentMovements = await prisma.stockMovement.count({
      where: {
        createdAt: {
          gte: fromDate,
          lte: toDate
        }
      }
    });

    // Get stock movements by type
    const movementsByType = await prisma.stockMovement.groupBy({
      by: ['type'],
      where: {
        createdAt: {
          gte: fromDate,
          lte: toDate
        }
      },
      _count: {
        type: true
      }
    });

    res.json({
      summary: {
        totalProducts,
        lowStockProducts,
        outOfStockProducts,
        totalValue: parseFloat(totalValue.toFixed(2)),
        recentMovements,
        lowStockThreshold // Include threshold in response
      },
      movementsByType: movementsByType.reduce((acc, movement) => {
        acc[movement.type] = movement._count.type;
        return acc;
      }, {}),
      period: { fromDate, toDate }
    });
  } catch (error) {
    console.error('Error fetching inventory summary:', error);
    res.status(500).json({ error: 'Failed to fetch inventory summary' });
  }
});

// Get inventory dashboard data
router.get('/dashboard', async (req, res) => {
  try {
    const { period = '30' } = req.query;
    const days = parseInt(period);
    const fromDate = new Date(new Date().setDate(new Date().getDate() - days));

    // Get stock movements over time
    const stockMovements = await prisma.stockMovement.groupBy({
      by: ['type', 'createdAt'],
      where: {
        createdAt: {
          gte: fromDate
        }
      },
      _sum: {
        quantity: true
      },
      orderBy: {
        createdAt: 'asc'
      }
    });

    // Get top products by stock value
    const topProducts = await prisma.product.findMany({
      where: { status: 'ACTIVE' },
      select: {
        id: true,
        name: true,
        stockQuantity: true,
        costPrice: true,
        sellingPrice: true
      },
      orderBy: {
        stockQuantity: 'desc'
      },
      take: 10
    });

    // Get low stock alerts
    const lowStockAlerts = await prisma.product.findMany({
      where: {
        status: 'ACTIVE',
        stockQuantity: {
          lte: 10
        }
      },
      select: {
        id: true,
        name: true,
        stockQuantity: true,
        reorderPoint: true,
        supplier: {
          select: {
            name: true,
            email: true
          }
        }
      },
      orderBy: {
        stockQuantity: 'asc'
      }
    });

    // Get inventory valuation by category
    const valuationByCategory = await prisma.product.groupBy({
      by: ['categoryId'],
      where: { status: 'ACTIVE' },
      _sum: {
        stockQuantity: true
      },
      _count: {
        id: true
      }
    });

    // Get category details for valuation
    const categories = await prisma.category.findMany({
      where: {
        id: {
          in: valuationByCategory.map(v => v.categoryId)
        }
      }
    });

    const valuationWithCategories = valuationByCategory.map(valuation => {
      const category = categories.find(c => c.id === valuation.categoryId);
      return {
        category: category?.name || 'Uncategorized',
        totalQuantity: valuation._sum.stockQuantity,
        productCount: valuation._count.id
      };
    });

    res.json({
      stockMovements: stockMovements.map(movement => ({
        type: movement.type,
        date: movement.createdAt,
        quantity: movement._sum.quantity
      })),
      topProducts: topProducts.map(product => ({
        ...product,
        stockValue: parseFloat(product.stockQuantity) * parseFloat(product.costPrice),
        profitMargin: ((parseFloat(product.sellingPrice) - parseFloat(product.costPrice)) / parseFloat(product.sellingPrice)) * 100
      })),
      lowStockAlerts,
      valuationByCategory: valuationWithCategories,
      period: { days, fromDate }
    });
  } catch (error) {
    console.error('Error fetching inventory dashboard:', error);
    res.status(500).json({ error: 'Failed to fetch inventory dashboard' });
  }
});

// ==================== STOCK MOVEMENTS ====================

// Get stock movements
router.get('/movements', async (req, res) => {
  try {
    const { 
      productId, 
      type, 
      dateFrom, 
      dateTo, 
      page = 1, 
      limit = 20,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;
    const skip = (page - 1) * limit;

    const where = {
      ...(productId && { productId }),
      ...(type && { type }),
      ...(dateFrom && dateTo && {
        createdAt: {
          gte: new Date(dateFrom),
          lte: new Date(dateTo)
        }
      })
    };

    const [movements, total] = await Promise.all([
      prisma.stockMovement.findMany({
        where,
        include: {
          product: {
            select: {
              name: true,
              sku: true
            }
          },
          user: {
            select: {
              firstName: true,
              lastName: true
            }
          }
        },
        orderBy: {
          [sortBy]: sortOrder
        },
        skip: parseInt(skip),
        take: parseInt(limit)
      }),
      prisma.stockMovement.count({ where })
    ]);

    res.json({
      movements,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching stock movements:', error);
    res.status(500).json({ error: 'Failed to fetch stock movements' });
  }
});

// Get stock movement by ID
router.get('/movements/:id', async (req, res) => {
  try {
    const movement = await prisma.stockMovement.findUnique({
      where: { id: req.params.id },
      include: {
        product: {
          select: {
            name: true,
            sku: true,
            description: true
          }
        },
        user: {
          select: {
            firstName: true,
            lastName: true,
            email: true
          }
        }
      }
    });

    if (!movement) {
      return res.status(404).json({ error: 'Stock movement not found' });
    }

    res.json(movement);
  } catch (error) {
    console.error('Error fetching stock movement:', error);
    res.status(500).json({ error: 'Failed to fetch stock movement' });
  }
});

// Create stock movement
router.post('/movements', [
  body('productId').notEmpty().withMessage('Product ID is required'),
  body('type').isIn(['IN', 'OUT', 'ADJUSTMENT', 'TRANSFER', 'RETURN']).withMessage('Invalid movement type'),
  body('quantity').isFloat({ min: 0.01 }).withMessage('Quantity must be a positive number'),
  body('reason').notEmpty().withMessage('Reason is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { productId, type, quantity, reason, reference, notes } = req.body;

    // Verify product exists
    const product = await prisma.product.findUnique({
      where: { id: productId }
    });

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    // Calculate new stock quantity
    let newQuantity = parseFloat(product.stockQuantity);
    if (type === 'IN' || type === 'RETURN') {
      newQuantity += parseFloat(quantity);
    } else if (type === 'OUT' || type === 'TRANSFER') {
      newQuantity -= parseFloat(quantity);
      if (newQuantity < 0) {
        return res.status(400).json({ error: 'Insufficient stock for this operation' });
      }
    } else if (type === 'ADJUSTMENT') {
      newQuantity = parseFloat(quantity);
    }

    // Create stock movement
    const movement = await prisma.stockMovement.create({
      data: {
        productId,
        type,
        quantity: parseFloat(quantity),
        reason,
        reference,
        notes,
        previousQuantity: parseFloat(product.stockQuantity),
        newQuantity,
        userId: req.user.id
      }
    });

    // Update product stock
    await prisma.product.update({
      where: { id: productId },
      data: {
        stockQuantity: newQuantity,
        lastStockUpdate: new Date()
      }
    });

    // Audit log
    await createAuditLog({
      userId: req.user.id,
      action: 'CREATE',
      entity: 'StockMovement',
      entityId: movement.id,
      newValues: movement,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.status(201).json(movement);
  } catch (error) {
    console.error('Error creating stock movement:', error);
    res.status(500).json({ error: 'Failed to create stock movement' });
  }
});

// ==================== STOCK ALERTS ====================

// Get low stock products
router.get('/alerts/low-stock', async (req, res) => {
  try {
    const { threshold = 10, page = 1, limit = 20 } = req.query;
    const skip = (page - 1) * limit;

    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where: {
          status: 'ACTIVE',
          stockQuantity: {
            lte: parseInt(threshold)
          }
        },
        include: {
          category: true,
          supplier: {
            select: {
              name: true,
              email: true,
              phone: true
            }
          }
        },
        orderBy: {
          stockQuantity: 'asc'
        },
        skip: parseInt(skip),
        take: parseInt(limit)
      }),
      prisma.product.count({
        where: {
          status: 'ACTIVE',
          stockQuantity: {
            lte: parseInt(threshold)
          }
        }
      })
    ]);

    res.json({
      products,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching low stock alerts:', error);
    res.status(500).json({ error: 'Failed to fetch low stock alerts' });
  }
});

// Get out of stock products
router.get('/alerts/out-of-stock', async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (page - 1) * limit;

    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where: {
          status: 'ACTIVE',
          stockQuantity: 0
        },
        include: {
          category: true,
          supplier: {
            select: {
              name: true,
              email: true,
              phone: true
            }
          }
        },
        orderBy: {
          lastStockUpdate: 'desc'
        },
        skip: parseInt(skip),
        take: parseInt(limit)
      }),
      prisma.product.count({
        where: {
          status: 'ACTIVE',
          stockQuantity: 0
        }
      })
    ]);

    res.json({
      products,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching out of stock alerts:', error);
    res.status(500).json({ error: 'Failed to fetch out of stock alerts' });
  }
});

// Get products below reorder point
router.get('/alerts/reorder-point', async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (page - 1) * limit;

    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where: {
          status: 'ACTIVE',
          stockQuantity: {
            lte: {
              path: ['reorderPoint'],
              gte: 1
            }
          }
        },
        include: {
          category: true,
          supplier: {
            select: {
              name: true,
              email: true,
              phone: true
            }
          }
        },
        orderBy: {
          stockQuantity: 'asc'
        },
        skip: parseInt(skip),
        take: parseInt(limit)
      }),
      prisma.product.count({
        where: {
          status: 'ACTIVE',
          stockQuantity: {
            lte: {
              path: ['reorderPoint'],
              gte: 1
            }
          }
        }
      })
    ]);

    res.json({
      products,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching reorder point alerts:', error);
    res.status(500).json({ error: 'Failed to fetch reorder point alerts' });
  }
});

// ==================== INVENTORY VALUATION ====================

// Get inventory valuation
router.get('/valuation', async (req, res) => {
  try {
    const { method = 'FIFO', date } = req.query;
    const asOfDate = date ? new Date(date) : new Date();

    const products = await prisma.product.findMany({
      where: { status: 'ACTIVE' },
      include: {
        category: true,
        stockMovements: {
          where: {
            createdAt: { lte: asOfDate }
          },
          orderBy: {
            createdAt: 'asc'
          }
        }
      }
    });

    const valuation = products.map(product => {
      let totalValue = 0;
      let averageCost = 0;

      if (method === 'FIFO') {
        // Calculate FIFO value
        let remainingQuantity = product.stockQuantity;
        let totalCost = 0;

        for (const movement of product.stockMovements) {
          if (movement.type === 'IN' && remainingQuantity > 0) {
            const quantityUsed = Math.min(remainingQuantity, movement.quantity);
            totalCost += quantityUsed * parseFloat(product.costPrice);
            remainingQuantity -= quantityUsed;
          }
        }

        totalValue = totalCost;
        averageCost = product.stockQuantity > 0 ? totalCost / product.stockQuantity : 0;
      } else if (method === 'AVERAGE') {
        // Calculate average cost
        const totalCost = parseFloat(product.costPrice) * parseFloat(product.stockQuantity);
        totalValue = totalCost;
        averageCost = parseFloat(product.costPrice);
      } else if (method === 'LIFO') {
        // Calculate LIFO value (simplified)
        totalValue = parseFloat(product.costPrice) * parseFloat(product.stockQuantity);
        averageCost = parseFloat(product.costPrice);
      }

      return {
        productId: product.id,
        productName: product.name,
        sku: product.sku,
        category: product.category?.name || 'Uncategorized',
        stockQuantity: product.stockQuantity,
        costPrice: parseFloat(product.costPrice),
        sellingPrice: parseFloat(product.sellingPrice),
        totalValue: parseFloat(totalValue.toFixed(2)),
        averageCost: parseFloat(averageCost.toFixed(2)),
        profitMargin: ((parseFloat(product.sellingPrice) - averageCost) / parseFloat(product.sellingPrice)) * 100
      };
    });

    const totalValue = valuation.reduce((sum, item) => sum + item.totalValue, 0);
    const totalCost = valuation.reduce((sum, item) => sum + (item.stockQuantity * item.costPrice), 0);

    res.json({
      valuation,
      summary: {
        totalProducts: valuation.length,
        totalValue: parseFloat(totalValue.toFixed(2)),
        totalCost: parseFloat(totalCost.toFixed(2)),
        averageProfitMargin: valuation.length > 0 ? 
          valuation.reduce((sum, item) => sum + item.profitMargin, 0) / valuation.length : 0
      },
      method,
      asOfDate
    });
  } catch (error) {
    console.error('Error calculating inventory valuation:', error);
    res.status(500).json({ error: 'Failed to calculate inventory valuation' });
  }
});

// ==================== STOCK ADJUSTMENTS ====================

// Bulk stock adjustment
router.post('/adjustments/bulk', [
  body('adjustments').isArray({ min: 1 }).withMessage('At least one adjustment is required'),
  body('adjustments.*.productId').notEmpty().withMessage('Product ID is required'),
  body('adjustments.*.quantity').isFloat().withMessage('Quantity must be a number'),
  body('adjustments.*.reason').notEmpty().withMessage('Reason is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { adjustments, notes } = req.body;

    const results = [];

    for (const adjustment of adjustments) {
      try {
        const { productId, quantity, reason } = adjustment;

        // Verify product exists
        const product = await prisma.product.findUnique({
          where: { id: productId }
        });

        if (!product) {
          results.push({
            productId,
            success: false,
            error: 'Product not found'
          });
          continue;
        }

        // Create stock movement
        const movement = await prisma.stockMovement.create({
          data: {
            productId,
            type: 'ADJUSTMENT',
            quantity: Math.abs(parseFloat(quantity)),
            reason,
            notes: notes || `Bulk adjustment: ${reason}`,
            previousQuantity: parseFloat(product.stockQuantity),
            newQuantity: parseFloat(quantity),
            userId: req.user.id
          }
        });

        // Update product stock
        await prisma.product.update({
          where: { id: productId },
          data: {
            stockQuantity: parseFloat(quantity),
            lastStockUpdate: new Date()
          }
        });

        results.push({
          productId,
          success: true,
          movementId: movement.id,
          previousQuantity: product.stockQuantity,
          newQuantity: quantity
        });

      } catch (error) {
        results.push({
          productId: adjustment.productId,
          success: false,
          error: error.message
        });
      }
    }

    // Audit log
    await createAuditLog({
      userId: req.user.id,
      action: 'BULK_ADJUSTMENT',
      entity: 'StockMovement',
      entityId: 'bulk',
      newValues: { adjustments, results },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.json({
      message: 'Bulk adjustment completed',
      results,
      summary: {
        total: adjustments.length,
        successful: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length
      }
    });
  } catch (error) {
    console.error('Error performing bulk adjustment:', error);
    res.status(500).json({ error: 'Failed to perform bulk adjustment' });
  }
});

// ==================== INVENTORY REPORTS ====================

// Get inventory aging report
router.get('/reports/aging', async (req, res) => {
  try {
    const { date } = req.query;
    const asOfDate = date ? new Date(date) : new Date();

    const products = await prisma.product.findMany({
      where: { status: 'ACTIVE' },
      include: {
        stockMovements: {
          where: {
            type: 'IN',
            createdAt: { lte: asOfDate }
          },
          orderBy: {
            createdAt: 'desc'
          }
        }
      }
    });

    const agingReport = products.map(product => {
      const currentStock = product.stockQuantity;
      let aging = {
        '0-30': 0,
        '31-60': 0,
        '61-90': 0,
        '91-180': 0,
        '180+': 0
      };

      let remainingStock = currentStock;

      for (const movement of product.stockMovements) {
        if (remainingStock <= 0) break;

        const daysOld = Math.floor((asOfDate - movement.createdAt) / (1000 * 60 * 60 * 24));
        const quantityFromMovement = Math.min(remainingStock, movement.quantity);

        if (daysOld <= 30) {
          aging['0-30'] += quantityFromMovement;
        } else if (daysOld <= 60) {
          aging['31-60'] += quantityFromMovement;
        } else if (daysOld <= 90) {
          aging['61-90'] += quantityFromMovement;
        } else if (daysOld <= 180) {
          aging['91-180'] += quantityFromMovement;
        } else {
          aging['180+'] += quantityFromMovement;
        }

        remainingStock -= quantityFromMovement;
      }

      return {
        productId: product.id,
        productName: product.name,
        sku: product.sku,
        currentStock,
        aging,
        totalValue: currentStock * parseFloat(product.costPrice)
      };
    });

    res.json({
      agingReport,
      asOfDate,
      summary: {
        totalProducts: agingReport.length,
        totalValue: agingReport.reduce((sum, item) => sum + item.totalValue, 0)
      }
    });
  } catch (error) {
    console.error('Error generating aging report:', error);
    res.status(500).json({ error: 'Failed to generate aging report' });
  }
});

// Get inventory turnover report
router.get('/reports/turnover', async (req, res) => {
  try {
    const { period = '365' } = req.query;
    const days = parseInt(period);
    const fromDate = new Date(new Date().setDate(new Date().getDate() - days));

    const products = await prisma.product.findMany({
      where: { status: 'ACTIVE' },
      include: {
        stockMovements: {
          where: {
            createdAt: { gte: fromDate }
          }
        }
      }
    });

    const turnoverReport = products.map(product => {
      const salesOut = product.stockMovements
        .filter(m => m.type === 'OUT')
        .reduce((sum, m) => sum + m.quantity, 0);

      const purchasesIn = product.stockMovements
        .filter(m => m.type === 'IN')
        .reduce((sum, m) => sum + m.quantity, 0);

      const averageStock = (parseFloat(product.stockQuantity) + salesOut) / 2;
      const turnoverRate = averageStock > 0 ? salesOut / averageStock : 0;
      const daysToTurnover = turnoverRate > 0 ? days / turnoverRate : 0;

      return {
        productId: product.id,
        productName: product.name,
        sku: product.sku,
        currentStock: product.stockQuantity,
        salesQuantity: salesOut,
        purchaseQuantity: purchasesIn,
        averageStock,
        turnoverRate: parseFloat(turnoverRate.toFixed(2)),
        daysToTurnover: parseFloat(daysToTurnover.toFixed(1))
      };
    });

    res.json({
      turnoverReport,
      period: { days, fromDate },
      summary: {
        totalProducts: turnoverReport.length,
        averageTurnoverRate: turnoverReport.reduce((sum, item) => sum + item.turnoverRate, 0) / turnoverReport.length
      }
    });
  } catch (error) {
    console.error('Error generating turnover report:', error);
    res.status(500).json({ error: 'Failed to generate turnover report' });
  }
});

// Export inventory report
router.get('/reports/export', async (req, res) => {
  try {
    const { format = 'csv', includeMovements = false } = req.query;

    const products = await prisma.product.findMany({
      where: { status: 'ACTIVE' },
      include: {
        category: true,
        supplier: {
          select: {
            name: true
          }
        },
        ...(includeMovements === 'true' && {
          stockMovements: {
            orderBy: {
              createdAt: 'desc'
            },
            take: 10
          }
        })
      },
      orderBy: {
        name: 'asc'
      }
    });

    if (format === 'csv') {
      const csvData = products.map(product => ({
        'Product ID': product.id,
        'Name': product.name,
        'SKU': product.sku,
        'Category': product.category?.name || 'Uncategorized',
        'Supplier': product.supplier?.name || 'N/A',
        'Stock Quantity': product.stockQuantity,
        'Cost Price': product.costPrice,
        'Selling Price': product.sellingPrice,
        'Stock Value': parseFloat(product.stockQuantity) * parseFloat(product.costPrice),
        'Reorder Point': product.reorderPoint,
        'Last Updated': product.lastStockUpdate
      }));

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=inventory-report.csv');
      
      const csv = this.convertToCSV(csvData);
      res.send(csv);
    } else {
      res.json({
        products,
        exportDate: new Date(),
        totalProducts: products.length,
        totalValue: products.reduce((sum, p) => sum + (parseFloat(p.stockQuantity) * parseFloat(p.costPrice)), 0)
      });
    }
  } catch (error) {
    console.error('Error exporting inventory report:', error);
    res.status(500).json({ error: 'Failed to export inventory report' });
  }
});

// Helper function to convert data to CSV
convertToCSV(data) {
  if (data.length === 0) return '';
  
  const headers = Object.keys(data[0]);
  const csvRows = [headers.join(',')];
  
  for (const row of data) {
    const values = headers.map(header => {
      const value = row[header];
      return typeof value === 'string' ? `"${value.replace(/"/g, '""')}"` : value;
    });
    csvRows.push(values.join(','));
  }
  
  return csvRows.join('\n');
}

module.exports = router;