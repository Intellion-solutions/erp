const express = require('express');
const { body, validationResult } = require('express-validator');
const { PrismaClient } = require('@prisma/client');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { logger } = require('../utils/logger');
const { createAuditLog } = require('../services/auditService');

const router = express.Router();
const prisma = new PrismaClient();

// Get all purchases
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      search, 
      startDate, 
      endDate, 
      status,
      supplierId 
    } = req.query;
    const skip = (page - 1) * limit;

    const where = {};
    
    if (search) {
      where.OR = [
        { purchaseNumber: { contains: search, mode: 'insensitive' } },
        { supplier: { name: { contains: search, mode: 'insensitive' } } },
        { user: { firstName: { contains: search, mode: 'insensitive' } } },
        { user: { lastName: { contains: search, mode: 'insensitive' } } }
      ];
    }

    if (startDate && endDate) {
      where.createdAt = {
        gte: new Date(startDate),
        lte: new Date(endDate)
      };
    }

    if (status) {
      where.status = status;
    }

    if (supplierId) {
      where.supplierId = supplierId;
    }

    const [purchases, total] = await Promise.all([
      prisma.purchase.findMany({
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
          },
          payments: true,
          _count: {
            select: { items: true, payments: true }
          }
        },
        skip: parseInt(skip),
        take: parseInt(limit),
        orderBy: { createdAt: 'desc' }
      }),
      prisma.purchase.count({ where })
    ]);

    res.json({
      purchases,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    logger.error('Error fetching purchases:', error);
    res.status(500).json({ error: 'Failed to fetch purchases' });
  }
});

// Get purchase by ID
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const purchase = await prisma.purchase.findUnique({
      where: { id },
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
            product: {
              include: {
                category: true,
                supplier: true
              }
            }
          }
        },
        payments: {
          orderBy: { createdAt: 'desc' }
        }
      }
    });

    if (!purchase) {
      return res.status(404).json({ error: 'Purchase not found' });
    }

    res.json(purchase);
  } catch (error) {
    logger.error('Error fetching purchase:', error);
    res.status(500).json({ error: 'Failed to fetch purchase' });
  }
});

// Create new purchase
router.post('/', [
  authenticateToken,
  requireRole(['OWNER', 'MANAGER']),
  body('supplierId').isString().withMessage('Supplier ID is required'),
  body('items').isArray({ min: 1 }).withMessage('At least one item is required'),
  body('items.*.productId').isString().withMessage('Product ID is required'),
  body('items.*.quantity').isInt({ min: 1 }).withMessage('Quantity must be at least 1'),
  body('items.*.unitCost').isFloat({ min: 0 }).withMessage('Unit cost must be positive'),
  body('expectedDate').optional().isISO8601().withMessage('Invalid date format'),
  body('notes').optional().trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { supplierId, items, expectedDate, notes } = req.body;

    // Validate supplier
    const supplier = await prisma.supplier.findUnique({
      where: { id: supplierId }
    });
    if (!supplier) {
      return res.status(400).json({ error: 'Supplier not found' });
    }

    // Validate products and calculate totals
    let subtotal = 0;
    let taxAmount = 0;
    let total = 0;

    for (const item of items) {
      const product = await prisma.product.findUnique({
        where: { id: item.productId }
      });

      if (!product) {
        return res.status(400).json({ error: `Product ${item.productId} not found` });
      }

      const itemTotal = item.unitCost * item.quantity;
      const itemTax = itemTotal * (product.taxRate / 100);
      
      subtotal += itemTotal;
      taxAmount += itemTax;
    }

    total = subtotal + taxAmount;

    // Generate purchase number
    const purchaseNumber = `PO-${Date.now()}-${Math.random().toString(36).substr(2, 5).toUpperCase()}`;

    // Create purchase with items
    const purchase = await prisma.purchase.create({
      data: {
        purchaseNumber,
        supplierId,
        userId: req.user.id,
        subtotal,
        taxAmount,
        total,
        expectedDate: expectedDate ? new Date(expectedDate) : null,
        notes,
        items: {
          create: items.map(item => {
            const product = items.find(p => p.productId === item.productId);
            const itemTotal = item.unitCost * item.quantity;
            const itemTax = itemTotal * (product.taxRate / 100);
            
            return {
              productId: item.productId,
              quantity: item.quantity,
              unitCost: item.unitCost,
              taxRate: product.taxRate,
              total: itemTotal + itemTax
            };
          })
        }
      },
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
      }
    });

    // Create audit log
    await createAuditLog({
      userId: req.user.id,
      action: 'CREATE',
      entity: 'Purchase',
      entityId: purchase.id,
      newValues: purchase
    });

    res.status(201).json(purchase);
  } catch (error) {
    logger.error('Error creating purchase:', error);
    res.status(500).json({ error: 'Failed to create purchase' });
  }
});

// Update purchase
router.put('/:id', [
  authenticateToken,
  requireRole(['OWNER', 'MANAGER']),
  body('status').optional().isIn(['DRAFT', 'PENDING', 'CONFIRMED', 'SHIPPED', 'DELIVERED', 'CANCELLED']).withMessage('Invalid status'),
  body('expectedDate').optional().isISO8601().withMessage('Invalid date format'),
  body('receivedDate').optional().isISO8601().withMessage('Invalid date format'),
  body('notes').optional().trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const { status, expectedDate, receivedDate, notes } = req.body;

    // Check if purchase exists
    const existingPurchase = await prisma.purchase.findUnique({
      where: { id },
      include: {
        items: true
      }
    });

    if (!existingPurchase) {
      return res.status(404).json({ error: 'Purchase not found' });
    }

    const oldValues = existingPurchase;
    const purchase = await prisma.purchase.update({
      where: { id },
      data: {
        status,
        expectedDate: expectedDate ? new Date(expectedDate) : null,
        receivedDate: receivedDate ? new Date(receivedDate) : null,
        notes
      },
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
        },
        payments: true
      }
    });

    // If status changed to DELIVERED, update inventory
    if (status === 'DELIVERED' && oldValues.status !== 'DELIVERED') {
      for (const item of existingPurchase.items) {
        await prisma.product.update({
          where: { id: item.productId },
          data: {
            currentStock: {
              increment: item.quantity
            }
          }
        });

        // Create stock movement
        await prisma.stockMovement.create({
          data: {
            productId: item.productId,
            type: 'PURCHASE',
            quantity: item.quantity,
            reference: purchase.id,
            notes: `Purchase ${purchase.purchaseNumber}`
          }
        });
      }
    }

    // Create audit log
    await createAuditLog({
      userId: req.user.id,
      action: 'UPDATE',
      entity: 'Purchase',
      entityId: purchase.id,
      oldValues,
      newValues: purchase
    });

    res.json(purchase);
  } catch (error) {
    logger.error('Error updating purchase:', error);
    res.status(500).json({ error: 'Failed to update purchase' });
  }
});

// Add payment to purchase
router.post('/:id/payments', [
  authenticateToken,
  requireRole(['OWNER', 'MANAGER']),
  body('amount').isFloat({ min: 0.01 }).withMessage('Amount must be positive'),
  body('method').isIn(['CASH', 'CARD', 'BANK_TRANSFER', 'MOBILE_MONEY', 'CHEQUE', 'CREDIT']).withMessage('Invalid payment method'),
  body('reference').optional().trim(),
  body('notes').optional().trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const { amount, method, reference, notes } = req.body;

    // Check if purchase exists
    const purchase = await prisma.purchase.findUnique({
      where: { id },
      include: {
        payments: true
      }
    });

    if (!purchase) {
      return res.status(404).json({ error: 'Purchase not found' });
    }

    // Calculate total paid
    const totalPaid = purchase.payments.reduce((sum, payment) => sum + parseFloat(payment.amount), 0);
    const remainingAmount = parseFloat(purchase.total) - totalPaid;

    if (amount > remainingAmount) {
      return res.status(400).json({ 
        error: `Payment amount exceeds remaining balance. Remaining: ${remainingAmount}` 
      });
    }

    // Create payment
    const payment = await prisma.payment.create({
      data: {
        amount,
        method,
        reference,
        notes,
        purchaseId: id,
        status: 'COMPLETED'
      }
    });

    res.status(201).json(payment);
  } catch (error) {
    logger.error('Error adding payment:', error);
    res.status(500).json({ error: 'Failed to add payment' });
  }
});

// Delete purchase
router.delete('/:id', [
  authenticateToken,
  requireRole(['OWNER', 'MANAGER'])
], async (req, res) => {
  try {
    const { id } = req.params;

    // Check if purchase exists
    const purchase = await prisma.purchase.findUnique({
      where: { id }
    });

    if (!purchase) {
      return res.status(404).json({ error: 'Purchase not found' });
    }

    // Only allow deletion of DRAFT purchases
    if (purchase.status !== 'DRAFT') {
      return res.status(400).json({ 
        error: 'Only draft purchases can be deleted' 
      });
    }

    await prisma.purchase.delete({
      where: { id }
    });

    // Create audit log
    await createAuditLog({
      userId: req.user.id,
      action: 'DELETE',
      entity: 'Purchase',
      entityId: id,
      oldValues: purchase
    });

    res.json({ message: 'Purchase deleted successfully' });
  } catch (error) {
    logger.error('Error deleting purchase:', error);
    res.status(500).json({ error: 'Failed to delete purchase' });
  }
});

// Get purchase analytics
router.get('/analytics/summary', authenticateToken, async (req, res) => {
  try {
    const { period = '30' } = req.query; // days

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(period));

    const [totalPurchases, totalSpent, avgOrderValue, purchasesByStatus] = await Promise.all([
      prisma.purchase.count({
        where: { createdAt: { gte: startDate } }
      }),
      prisma.purchase.aggregate({
        where: { createdAt: { gte: startDate } },
        _sum: { total: true }
      }),
      prisma.purchase.aggregate({
        where: { createdAt: { gte: startDate } },
        _avg: { total: true }
      }),
      prisma.purchase.groupBy({
        by: ['status'],
        where: { createdAt: { gte: startDate } },
        _count: { id: true },
        _sum: { total: true }
      })
    ]);

    const analytics = {
      period: parseInt(period),
      totalPurchases,
      totalSpent: totalSpent._sum.total || 0,
      avgOrderValue: avgOrderValue._avg.total || 0,
      purchasesByStatus
    };

    res.json(analytics);
  } catch (error) {
    logger.error('Error fetching purchase analytics:', error);
    res.status(500).json({ error: 'Failed to fetch purchase analytics' });
  }
});

module.exports = router;