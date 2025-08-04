const express = require('express');
const { body, validationResult } = require('express-validator');
const { PrismaClient } = require('@prisma/client');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { logger } = require('../utils/logger');
const { createAuditLog } = require('../services/auditService');
const { generateInvoicePDF } = require('../services/invoiceService');

const router = express.Router();
const prisma = new PrismaClient();

// ==================== RECURRING INVOICES ====================
const { io } = require('../services/socketService');

// Get all recurring invoices
router.get('/recurring', authenticateToken, async (req, res) => {
  try {
    const rec = await prisma.recurringInvoice.findMany({ include: { sale: true } });
    res.json(rec);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch recurring invoices' });
  }
});

// Create recurring invoice
router.post('/recurring', authenticateToken, [
  body('saleId').notEmpty(),
  body('schedule').notEmpty(),
  body('nextRun').notEmpty()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    const { saleId, schedule, nextRun } = req.body;
    const recurring = await prisma.recurringInvoice.create({ data: { saleId, schedule, nextRun: new Date(nextRun) } });
    await createAuditLog({ userId: req.user.id, action: 'CREATE', entity: 'RecurringInvoice', entityId: recurring.id, newValues: recurring });
    res.status(201).json(recurring);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create recurring invoice' });
  }
});

// ==================== CREDIT NOTES ====================

// Get all credit notes
router.get('/credit-notes', authenticateToken, async (req, res) => {
  try {
    const notes = await prisma.creditNote.findMany({ include: { sale: true, issuedBy: true, approvedBy: true } });
    res.json(notes);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch credit notes' });
  }
});

// Create credit note
router.post('/credit-notes', authenticateToken, [
  body('saleId').notEmpty(),
  body('amount').isFloat({ min: 0 }),
  body('reason').notEmpty()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    const { saleId, amount, reason } = req.body;
    const note = await prisma.creditNote.create({ data: { saleId, amount, reason, issuedById: req.user.id } });
    await createAuditLog({ userId: req.user.id, action: 'CREATE', entity: 'CreditNote', entityId: note.id, newValues: note });
    res.status(201).json(note);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create credit note' });
  }
});

// Approve credit note
router.post('/credit-notes/:id/approve', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const note = await prisma.creditNote.update({ where: { id }, data: { status: 'APPROVED', approvedById: req.user.id, approvedAt: new Date() } });
    await createAuditLog({ userId: req.user.id, action: 'APPROVE', entity: 'CreditNote', entityId: id, newValues: note });
    res.json(note);
  } catch (error) {
    res.status(500).json({ error: 'Failed to approve credit note' });
  }
});

// ==================== SALES TARGETS & COMMISSIONS ====================

// Get all sales targets
router.get('/sales-targets', authenticateToken, async (req, res) => {
  try {
    const targets = await prisma.salesTarget.findMany({ include: { user: true, commissions: true } });
    res.json(targets);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch sales targets' });
  }
});

// Create sales target
router.post('/sales-targets', authenticateToken, [
  body('userId').notEmpty(),
  body('period').notEmpty(),
  body('targetAmount').isFloat({ min: 0 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    const { userId, period, targetAmount } = req.body;
    const target = await prisma.salesTarget.create({ data: { userId, period, targetAmount } });
    await createAuditLog({ userId: req.user.id, action: 'CREATE', entity: 'SalesTarget', entityId: target.id, newValues: target });
    res.status(201).json(target);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create sales target' });
  }
});

// Get all commissions
router.get('/commissions', authenticateToken, async (req, res) => {
  try {
    const commissions = await prisma.commission.findMany({ include: { salesTarget: true, sale: true, user: true } });
    res.json(commissions);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch commissions' });
  }
});

// ==================== REAL-TIME STATUS (STUB) ====================

function emitSaleStatusUpdate(saleId, status) {
  if (io) io.emit('saleStatusUpdated', { saleId, status });
}

// ==================== EMAIL/SMS DELIVERY (STUB) ====================

router.post('/:id/send-email', authenticateToken, async (req, res) => {
  // Stub: integrate with email service
  res.json({ message: 'Invoice email sent (stub)' });
});

router.post('/:id/send-sms', authenticateToken, async (req, res) => {
  // Stub: integrate with SMS service
  res.json({ message: 'Invoice SMS sent (stub)' });
});

// Get all sales
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      search, 
      startDate, 
      endDate, 
      status,
      paymentStatus 
    } = req.query;
    const skip = (page - 1) * limit;

    const where = {};
    
    if (search) {
      where.OR = [
        { saleNumber: { contains: search, mode: 'insensitive' } },
        { customer: { name: { contains: search, mode: 'insensitive' } } },
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
      where.paymentStatus = status;
    }

    if (paymentStatus) {
      where.paymentStatus = paymentStatus;
    }

    const [sales, total] = await Promise.all([
      prisma.sale.findMany({
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
      prisma.sale.count({ where })
    ]);

    res.json({
      sales,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    logger.error('Error fetching sales:', error);
    res.status(500).json({ error: 'Failed to fetch sales' });
  }
});

// Get sale by ID
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const sale = await prisma.sale.findUnique({
      where: { id },
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

    if (!sale) {
      return res.status(404).json({ error: 'Sale not found' });
    }

    res.json(sale);
  } catch (error) {
    logger.error('Error fetching sale:', error);
    res.status(500).json({ error: 'Failed to fetch sale' });
  }
});

// Create new sale
router.post('/', [
  authenticateToken,
  body('customerId').optional().isString(),
  body('items').isArray({ min: 1 }).withMessage('At least one item is required'),
  body('items.*.productId').isString().withMessage('Product ID is required'),
  body('items.*.quantity').isInt({ min: 1 }).withMessage('Quantity must be at least 1'),
  body('items.*.unitPrice').isFloat({ min: 0 }).withMessage('Unit price must be positive'),
  body('items.*.discount').optional().isFloat({ min: 0 }).withMessage('Discount must be positive'),
  body('paymentMethod').isIn(['CASH', 'CARD', 'BANK_TRANSFER', 'MOBILE_MONEY', 'CHEQUE', 'CREDIT']).withMessage('Invalid payment method'),
  body('notes').optional().trim(),
  body('terminalId').optional().isString()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { customerId, items, paymentMethod, notes, terminalId } = req.body;

    // Validate customer if provided
    if (customerId) {
      const customer = await prisma.customer.findUnique({
        where: { id: customerId }
      });
      if (!customer) {
        return res.status(400).json({ error: 'Customer not found' });
      }
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

      if (product.currentStock < item.quantity) {
        return res.status(400).json({ 
          error: `Insufficient stock for ${product.name}. Available: ${product.currentStock}` 
        });
      }

      const itemTotal = (item.unitPrice * item.quantity) - (item.discount || 0);
      const itemTax = itemTotal * (product.taxRate / 100);
      
      subtotal += itemTotal;
      taxAmount += itemTax;
    }

    total = subtotal + taxAmount;

    // Generate sale number
    const saleNumber = `SALE-${Date.now()}-${Math.random().toString(36).substr(2, 5).toUpperCase()}`;

    // Create sale with items
    const sale = await prisma.sale.create({
      data: {
        saleNumber,
        customerId,
        userId: req.user.id,
        subtotal,
        taxAmount,
        total,
        paymentMethod,
        notes,
        terminalId,
        items: {
          create: items.map(item => {
            const product = items.find(p => p.productId === item.productId);
            const itemTotal = (item.unitPrice * item.quantity) - (item.discount || 0);
            const itemTax = itemTotal * (product.taxRate / 100);
            
            return {
              productId: item.productId,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              discount: item.discount || 0,
              taxRate: product.taxRate,
              total: itemTotal + itemTax
            };
          })
        }
      },
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
      }
    });

    // Update product stock
    for (const item of items) {
      await prisma.product.update({
        where: { id: item.productId },
        data: {
          currentStock: {
            decrement: item.quantity
          }
        }
      });

      // Create stock movement
      await prisma.stockMovement.create({
        data: {
          productId: item.productId,
          type: 'SALE',
          quantity: -item.quantity,
          reference: sale.id,
          notes: `Sale ${saleNumber}`
        }
      });
    }

    // Create audit log
    await createAuditLog({
      userId: req.user.id,
      action: 'CREATE',
      entity: 'Sale',
      entityId: sale.id,
      newValues: sale
    });

    res.status(201).json(sale);
  } catch (error) {
    logger.error('Error creating sale:', error);
    res.status(500).json({ error: 'Failed to create sale' });
  }
});

// Update sale
router.put('/:id', [
  authenticateToken,
  requireRole(['OWNER', 'MANAGER']),
  body('paymentStatus').optional().isIn(['PENDING', 'COMPLETED', 'FAILED', 'CANCELLED', 'REFUNDED']).withMessage('Invalid payment status'),
  body('notes').optional().trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const { paymentStatus, notes } = req.body;

    // Check if sale exists
    const existingSale = await prisma.sale.findUnique({
      where: { id }
    });

    if (!existingSale) {
      return res.status(404).json({ error: 'Sale not found' });
    }

    const oldValues = existingSale;
    const sale = await prisma.sale.update({
      where: { id },
      data: {
        paymentStatus,
        notes
      },
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
        },
        payments: true
      }
    });

    // Create audit log
    await createAuditLog({
      userId: req.user.id,
      action: 'UPDATE',
      entity: 'Sale',
      entityId: sale.id,
      oldValues,
      newValues: sale
    });

    res.json(sale);
  } catch (error) {
    logger.error('Error updating sale:', error);
    res.status(500).json({ error: 'Failed to update sale' });
  }
});

// Add payment to sale
router.post('/:id/payments', [
  authenticateToken,
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

    // Check if sale exists
    const sale = await prisma.sale.findUnique({
      where: { id },
      include: {
        payments: true
      }
    });

    if (!sale) {
      return res.status(404).json({ error: 'Sale not found' });
    }

    // Calculate total paid
    const totalPaid = sale.payments.reduce((sum, payment) => sum + parseFloat(payment.amount), 0);
    const remainingAmount = parseFloat(sale.total) - totalPaid;

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
        saleId: id,
        status: 'COMPLETED'
      }
    });

    // Update sale payment status if fully paid
    const newTotalPaid = totalPaid + parseFloat(amount);
    if (newTotalPaid >= parseFloat(sale.total)) {
      await prisma.sale.update({
        where: { id },
        data: { paymentStatus: 'COMPLETED' }
      });
    }

    res.status(201).json(payment);
  } catch (error) {
    logger.error('Error adding payment:', error);
    res.status(500).json({ error: 'Failed to add payment' });
  }
});

// Generate invoice PDF
router.get('/:id/invoice', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const sale = await prisma.sale.findUnique({
      where: { id },
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
      }
    });

    if (!sale) {
      return res.status(404).json({ error: 'Sale not found' });
    }

    const pdfBuffer = await generateInvoicePDF(sale);
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="invoice-${sale.saleNumber}.pdf"`);
    res.send(pdfBuffer);
  } catch (error) {
    logger.error('Error generating invoice:', error);
    res.status(500).json({ error: 'Failed to generate invoice' });
  }
});

// Get sales analytics
router.get('/analytics/summary', authenticateToken, async (req, res) => {
  try {
    const { period = '30' } = req.query; // days

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(period));

    const [totalSales, totalRevenue, avgOrderValue, salesByStatus] = await Promise.all([
      prisma.sale.count({
        where: { createdAt: { gte: startDate } }
      }),
      prisma.sale.aggregate({
        where: { createdAt: { gte: startDate } },
        _sum: { total: true }
      }),
      prisma.sale.aggregate({
        where: { createdAt: { gte: startDate } },
        _avg: { total: true }
      }),
      prisma.sale.groupBy({
        by: ['paymentStatus'],
        where: { createdAt: { gte: startDate } },
        _count: { id: true },
        _sum: { total: true }
      })
    ]);

    const analytics = {
      period: parseInt(period),
      totalSales,
      totalRevenue: totalRevenue._sum.total || 0,
      avgOrderValue: avgOrderValue._avg.total || 0,
      salesByStatus
    };

    res.json(analytics);
  } catch (error) {
    logger.error('Error fetching sales analytics:', error);
    res.status(500).json({ error: 'Failed to fetch sales analytics' });
  }
});

module.exports = router;