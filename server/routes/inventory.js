const express = require('express');
const { body, validationResult } = require('express-validator');
const { PrismaClient } = require('@prisma/client');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { logger } = require('../utils/logger');
const { createAuditLog } = require('../services/auditService');

const router = express.Router();
const prisma = new PrismaClient();

// Get inventory summary
router.get('/summary', authenticateToken, async (req, res) => {
  try {
    const [totalProducts, lowStockProducts, outOfStockProducts, totalValue] = await Promise.all([
      prisma.product.count(),
      prisma.product.count({
        where: {
          currentStock: {
            lte: prisma.product.fields.minStock
          },
          status: 'ACTIVE'
        }
      }),
      prisma.product.count({
        where: {
          currentStock: 0,
          status: 'ACTIVE'
        }
      }),
      prisma.product.aggregate({
        _sum: {
          currentStock: true
        }
      })
    ]);

    const summary = {
      totalProducts,
      lowStockProducts,
      outOfStockProducts,
      totalStockItems: totalValue._sum.currentStock || 0
    };

    res.json(summary);
  } catch (error) {
    logger.error('Error fetching inventory summary:', error);
    res.status(500).json({ error: 'Failed to fetch inventory summary' });
  }
});

// Get stock movements
router.get('/movements', authenticateToken, async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      productId, 
      type, 
      startDate, 
      endDate 
    } = req.query;
    const skip = (page - 1) * limit;

    const where = {};
    
    if (productId) {
      where.productId = productId;
    }

    if (type) {
      where.type = type;
    }

    if (startDate && endDate) {
      where.createdAt = {
        gte: new Date(startDate),
        lte: new Date(endDate)
      };
    }

    const [movements, total] = await Promise.all([
      prisma.stockMovement.findMany({
        where,
        include: {
          product: {
            include: {
              category: true,
              supplier: true
            }
          }
        },
        skip: parseInt(skip),
        take: parseInt(limit),
        orderBy: { createdAt: 'desc' }
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
    logger.error('Error fetching stock movements:', error);
    res.status(500).json({ error: 'Failed to fetch stock movements' });
  }
});

// Get low stock products
router.get('/low-stock', authenticateToken, async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const skip = (page - 1) * limit;

    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where: {
          currentStock: {
            lte: prisma.product.fields.minStock
          },
          status: 'ACTIVE'
        },
        include: {
          category: true,
          supplier: true
        },
        skip: parseInt(skip),
        take: parseInt(limit),
        orderBy: { currentStock: 'asc' }
      }),
      prisma.product.count({
        where: {
          currentStock: {
            lte: prisma.product.fields.minStock
          },
          status: 'ACTIVE'
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
    logger.error('Error fetching low stock products:', error);
    res.status(500).json({ error: 'Failed to fetch low stock products' });
  }
});

// Get out of stock products
router.get('/out-of-stock', authenticateToken, async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const skip = (page - 1) * limit;

    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where: {
          currentStock: 0,
          status: 'ACTIVE'
        },
        include: {
          category: true,
          supplier: true
        },
        skip: parseInt(skip),
        take: parseInt(limit),
        orderBy: { name: 'asc' }
      }),
      prisma.product.count({
        where: {
          currentStock: 0,
          status: 'ACTIVE'
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
    logger.error('Error fetching out of stock products:', error);
    res.status(500).json({ error: 'Failed to fetch out of stock products' });
  }
});

// Adjust stock level
router.post('/adjust', [
  authenticateToken,
  requireRole(['OWNER', 'MANAGER']),
  body('productId').isString().withMessage('Product ID is required'),
  body('quantity').isInt().withMessage('Quantity must be an integer'),
  body('type').isIn(['ADJUSTMENT', 'TRANSFER']).withMessage('Invalid movement type'),
  body('notes').optional().trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { productId, quantity, type, notes } = req.body;

    // Check if product exists
    const product = await prisma.product.findUnique({
      where: { id: productId }
    });

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    // Calculate new stock level
    const newStock = product.currentStock + quantity;

    if (newStock < 0) {
      return res.status(400).json({ 
        error: 'Stock adjustment would result in negative stock level' 
      });
    }

    // Update product stock
    const updatedProduct = await prisma.product.update({
      where: { id: productId },
      data: {
        currentStock: newStock
      },
      include: {
        category: true,
        supplier: true
      }
    });

    // Create stock movement
    const movement = await prisma.stockMovement.create({
      data: {
        productId,
        type,
        quantity,
        notes: notes || `Manual adjustment by ${req.user.firstName} ${req.user.lastName}`
      },
      include: {
        product: true
      }
    });

    // Create audit log
    await createAuditLog({
      userId: req.user.id,
      action: 'UPDATE',
      entity: 'Product',
      entityId: productId,
      oldValues: { currentStock: product.currentStock },
      newValues: { currentStock: newStock }
    });

    res.json({
      product: updatedProduct,
      movement
    });
  } catch (error) {
    logger.error('Error adjusting stock:', error);
    res.status(500).json({ error: 'Failed to adjust stock' });
  }
});

// Bulk stock adjustment
router.post('/bulk-adjust', [
  authenticateToken,
  requireRole(['OWNER', 'MANAGER']),
  body('adjustments').isArray({ min: 1 }).withMessage('At least one adjustment is required'),
  body('adjustments.*.productId').isString().withMessage('Product ID is required'),
  body('adjustments.*.quantity').isInt().withMessage('Quantity must be an integer'),
  body('adjustments.*.type').isIn(['ADJUSTMENT', 'TRANSFER']).withMessage('Invalid movement type'),
  body('adjustments.*.notes').optional().trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { adjustments } = req.body;

    // Validate all products exist
    const productIds = adjustments.map(adj => adj.productId);
    const products = await prisma.product.findMany({
      where: {
        id: { in: productIds }
      }
    });

    if (products.length !== productIds.length) {
      return res.status(400).json({ error: 'One or more products not found' });
    }

    const results = [];

    // Process each adjustment
    for (const adjustment of adjustments) {
      const product = products.find(p => p.id === adjustment.productId);
      const newStock = product.currentStock + adjustment.quantity;

      if (newStock < 0) {
        return res.status(400).json({ 
          error: `Stock adjustment for ${product.name} would result in negative stock level` 
        });
      }

      // Update product stock
      const updatedProduct = await prisma.product.update({
        where: { id: adjustment.productId },
        data: {
          currentStock: newStock
        }
      });

      // Create stock movement
      const movement = await prisma.stockMovement.create({
        data: {
          productId: adjustment.productId,
          type: adjustment.type,
          quantity: adjustment.quantity,
          notes: adjustment.notes || `Bulk adjustment by ${req.user.firstName} ${req.user.lastName}`
        }
      });

      // Create audit log
      await createAuditLog({
        userId: req.user.id,
        action: 'UPDATE',
        entity: 'Product',
        entityId: adjustment.productId,
        oldValues: { currentStock: product.currentStock },
        newValues: { currentStock: newStock }
      });

      results.push({
        product: updatedProduct,
        movement
      });
    }

    res.json({ results });
  } catch (error) {
    logger.error('Error performing bulk stock adjustment:', error);
    res.status(500).json({ error: 'Failed to perform bulk stock adjustment' });
  }
});

// Get inventory valuation
router.get('/valuation', authenticateToken, async (req, res) => {
  try {
    const products = await prisma.product.findMany({
      where: {
        status: 'ACTIVE'
      },
      select: {
        id: true,
        name: true,
        currentStock: true,
        cost: true,
        price: true
      }
    });

    let totalCost = 0;
    let totalValue = 0;

    products.forEach(product => {
      const costValue = parseFloat(product.cost) * product.currentStock;
      const retailValue = parseFloat(product.price) * product.currentStock;
      
      totalCost += costValue;
      totalValue += retailValue;
    });

    const valuation = {
      totalProducts: products.length,
      totalStockItems: products.reduce((sum, p) => sum + p.currentStock, 0),
      totalCost,
      totalValue,
      grossProfit: totalValue - totalCost
    };

    res.json(valuation);
  } catch (error) {
    logger.error('Error calculating inventory valuation:', error);
    res.status(500).json({ error: 'Failed to calculate inventory valuation' });
  }
});

// Get stock alerts
router.get('/alerts', authenticateToken, async (req, res) => {
  try {
    const [lowStockAlerts, outOfStockAlerts] = await Promise.all([
      prisma.product.findMany({
        where: {
          currentStock: {
            lte: prisma.product.fields.minStock
          },
          status: 'ACTIVE'
        },
        include: {
          category: true,
          supplier: true
        },
        orderBy: { currentStock: 'asc' }
      }),
      prisma.product.findMany({
        where: {
          currentStock: 0,
          status: 'ACTIVE'
        },
        include: {
          category: true,
          supplier: true
        },
        orderBy: { name: 'asc' }
      })
    ]);

    const alerts = {
      lowStock: lowStockAlerts,
      outOfStock: outOfStockAlerts,
      totalAlerts: lowStockAlerts.length + outOfStockAlerts.length
    };

    res.json(alerts);
  } catch (error) {
    logger.error('Error fetching stock alerts:', error);
    res.status(500).json({ error: 'Failed to fetch stock alerts' });
  }
});

// Export inventory report
router.get('/export', authenticateToken, async (req, res) => {
  try {
    const { format = 'csv' } = req.query;

    const products = await prisma.product.findMany({
      include: {
        category: true,
        supplier: true
      },
      orderBy: { name: 'asc' }
    });

    if (format === 'csv') {
      const csvData = products.map(product => ({
        'Product Name': product.name,
        'SKU': product.sku,
        'Category': product.category?.name || '',
        'Supplier': product.supplier?.name || '',
        'Current Stock': product.currentStock,
        'Min Stock': product.minStock,
        'Max Stock': product.maxStock || '',
        'Unit Cost': product.cost,
        'Unit Price': product.price,
        'Status': product.status
      }));

      // Convert to CSV
      const csvHeaders = Object.keys(csvData[0]);
      const csvContent = [
        csvHeaders.join(','),
        ...csvData.map(row => csvHeaders.map(header => `"${row[header]}"`).join(','))
      ].join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="inventory-report.csv"');
      res.send(csvContent);
    } else {
      res.json(products);
    }
  } catch (error) {
    logger.error('Error exporting inventory report:', error);
    res.status(500).json({ error: 'Failed to export inventory report' });
  }
});

module.exports = router;