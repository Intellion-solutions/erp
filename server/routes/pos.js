const express = require('express');
const { body, validationResult, query } = require('express-validator');
const { PrismaClient } = require('@prisma/client');
const { Decimal } = require('decimal.js');
const { v4: uuidv4 } = require('uuid');
const QRCode = require('qrcode');

const { logger } = require('../utils/logger');
const { authenticateToken, canProcessSales } = require('../middleware/auth');
const { auditLog } = require('../services/auditService');
const { sendToTerminal, broadcastToAll, updateDashboard } = require('../services/socketService');
const settingsService = require('../services/settingsService');


const router = express.Router();
const prisma = new PrismaClient();

// Get POS settings
router.get('/settings', authenticateToken, async (req, res) => {
  try {
    const posSettings = await settingsService.getPOSSettings();
    res.json(posSettings);
  } catch (error) {
    logger.error('Error fetching POS settings:', error);
    res.status(500).json({ error: 'Failed to fetch POS settings' });
  }
});


// Get all active products for POS
router.get('/products', [authenticateToken, canProcessSales], async (req, res) => {
  try {
    const { search, category, barcode } = req.query;
    const where = { status: 'ACTIVE' };

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { sku: { contains: search, mode: 'insensitive' } },
        { barcode: { contains: search, mode: 'insensitive' } }
      ];
    }

    if (category) {
      where.categoryId = category;
    }

    if (barcode) {
      where.barcode = barcode;
    }

    const products = await prisma.product.findMany({
      where,
      include: {
        category: {
          select: { id: true, name: true }
        },
        supplier: {
          select: { id: true, name: true }
        }
      },
      orderBy: { name: 'asc' }
    });

    res.json({ products });
  } catch (error) {
    logger.error('POS products fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

// Search product by barcode/RFID
router.get('/product/:identifier', [authenticateToken, canProcessSales], async (req, res) => {
  try {
    const { identifier } = req.params;

    const product = await prisma.product.findFirst({
      where: {
        OR: [
          { barcode: identifier },
          { rfidTag: identifier },
          { sku: identifier }
        ],
        status: 'ACTIVE'
      },
      include: {
        category: {
          select: { id: true, name: true }
        }
      }
    });

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    res.json({ product });
  } catch (error) {
    logger.error('Product lookup error:', error);
    res.status(500).json({ error: 'Failed to lookup product' });
  }
});

// Start a new sale
router.post('/sale/start', [authenticateToken, canProcessSales], async (req, res) => {
  try {
    const { customerId, terminalId } = req.body;

    // Get POS settings for receipt configuration
    const posSettings = await settingsService.getPOSSettings();

    // Generate unique sale number using settings
    const lastSale = await prisma.sale.findFirst({
      orderBy: { createdAt: 'desc' }
    });

    let nextNumber = 1;
    if (lastSale) {
      const lastNumber = parseInt(lastSale.saleNumber.replace(/\D/g, '')) || 0;
      nextNumber = lastNumber + 1;
    }

    const saleNumber = `POS-${nextNumber.toString().padStart(6, '0')}`;


    const saleData = {
      saleNumber,
      userId: req.user.id,
      subtotal: new Decimal(0),
      taxAmount: new Decimal(0),
      total: new Decimal(0),
      paymentMethod: 'CASH', // Default, will be updated on completion
      paymentStatus: 'PENDING',
      terminalId
    };

    if (customerId) {
      saleData.customerId = customerId;
    }

    const sale = await prisma.sale.create({
      data: saleData,
      include: {
        customer: {
          select: { id: true, name: true, email: true, phone: true }
        },
        user: {
          select: { id: true, firstName: true, lastName: true }
        }
      }
    });

    // Log the action
    await auditLog('SALE_START', 'Sale', sale.id, null, sale, req);

    // Broadcast to terminals for real-time sync
    if (terminalId) {
      sendToTerminal(terminalId, 'sale_started', {
        sale,
        startedBy: req.user.id
      });
    }

    logger.info(`Sale started: ${saleNumber} by ${req.user.email}`);

    res.status(201).json({
      message: 'Sale started successfully',
      sale
    });
  } catch (error) {
    logger.error('Sale start error:', error);
    res.status(500).json({ error: 'Failed to start sale' });
  }
});

// Add item to sale
router.post('/sale/:saleId/items', [
  authenticateToken,
  canProcessSales,
  body('productId').notEmpty(),
  body('quantity').isInt({ min: 1 }),
  body('discount').optional().isFloat({ min: 0 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { saleId } = req.params;
    const { productId, quantity, discount = 0 } = req.body;

    // Check if sale exists and is pending
    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      include: { items: true }
    });

    if (!sale) {
      return res.status(404).json({ error: 'Sale not found' });
    }

    if (sale.paymentStatus !== 'PENDING') {
      return res.status(400).json({ error: 'Cannot modify completed sale' });
    }

    // Get product details
    const product = await prisma.product.findUnique({
      where: { id: productId }
    });

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    // Check stock availability
    if (product.currentStock < quantity) {
      return res.status(400).json({ 
        error: 'Insufficient stock',
        available: product.currentStock,
        requested: quantity
      });
    }

    // Calculate item totals
    const unitPrice = new Decimal(product.price);
    const discountAmount = new Decimal(discount);
    const taxRate = new Decimal(product.taxRate);
    const subtotal = unitPrice.mul(quantity).minus(discountAmount);
    const taxAmount = subtotal.mul(taxRate).div(100);
    const total = subtotal.plus(taxAmount);

    // Check if item already exists in sale
    const existingItem = sale.items.find(item => item.productId === productId);

    let saleItem;
    if (existingItem) {
      // Update existing item
      const newQuantity = existingItem.quantity + quantity;
      const newTotal = unitPrice.mul(newQuantity).minus(discountAmount);
      const newTaxAmount = newTotal.mul(taxRate).div(100);

      saleItem = await prisma.saleItem.update({
        where: { id: existingItem.id },
        data: {
          quantity: newQuantity,
          total: newTotal.plus(newTaxAmount)
        },
        include: {
          product: {
            select: { id: true, name: true, sku: true, price: true }
          }
        }
      });
    } else {
      // Create new item
      saleItem = await prisma.saleItem.create({
        data: {
          saleId,
          productId,
          quantity,
          unitPrice,
          discount: discountAmount,
          taxRate,
          total
        },
        include: {
          product: {
            select: { id: true, name: true, sku: true, price: true }
          }
        }
      });
    }

    // Update sale totals
    const updatedSale = await updateSaleTotals(saleId);

    // Log the action
    await auditLog('SALE_ITEM_ADD', 'SaleItem', saleItem.id, null, saleItem, req);

    // Broadcast to terminals
    if (sale.terminalId) {
      sendToTerminal(sale.terminalId, 'sale_item_added', {
        saleId,
        item: saleItem,
        sale: updatedSale,
        addedBy: req.user.id
      });
    }

    res.json({
      message: 'Item added to sale',
      item: saleItem,
      sale: updatedSale
    });
  } catch (error) {
    logger.error('Add sale item error:', error);
    res.status(500).json({ error: 'Failed to add item to sale' });
  }
});

// Remove item from sale
router.delete('/sale/:saleId/items/:itemId', [authenticateToken, canProcessSales], async (req, res) => {
  try {
    const { saleId, itemId } = req.params;

    // Check if sale exists and is pending
    const sale = await prisma.sale.findUnique({
      where: { id: saleId }
    });

    if (!sale) {
      return res.status(404).json({ error: 'Sale not found' });
    }

    if (sale.paymentStatus !== 'PENDING') {
      return res.status(400).json({ error: 'Cannot modify completed sale' });
    }

    // Get item before deletion
    const item = await prisma.saleItem.findUnique({
      where: { id: itemId },
      include: {
        product: {
          select: { name: true }
        }
      }
    });

    if (!item) {
      return res.status(404).json({ error: 'Sale item not found' });
    }

    // Delete the item
    await prisma.saleItem.delete({
      where: { id: itemId }
    });

    // Update sale totals
    const updatedSale = await updateSaleTotals(saleId);

    // Log the action
    await auditLog('SALE_ITEM_REMOVE', 'SaleItem', itemId, item, null, req);

    // Broadcast to terminals
    if (sale.terminalId) {
      sendToTerminal(sale.terminalId, 'sale_item_removed', {
        saleId,
        itemId,
        sale: updatedSale,
        removedBy: req.user.id
      });
    }

    res.json({
      message: 'Item removed from sale',
      sale: updatedSale
    });
  } catch (error) {
    logger.error('Remove sale item error:', error);
    res.status(500).json({ error: 'Failed to remove item from sale' });
  }
});

// Complete sale
router.post('/sale/:saleId/complete', [
  authenticateToken,
  canProcessSales,
  body('paymentMethod').isIn(['CASH', 'CARD', 'BANK_TRANSFER', 'MOBILE_MONEY', 'CHEQUE', 'CREDIT']),
  body('amountPaid').isFloat({ min: 0 }),
  body('paymentReference').optional()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { saleId } = req.params;
    const { paymentMethod, amountPaid, paymentReference, notes } = req.body;

    // Start transaction
    const result = await prisma.$transaction(async (tx) => {
      // Get sale with items
      const sale = await tx.sale.findUnique({
        where: { id: saleId },
        include: {
          items: {
            include: {
              product: true
            }
          },
          customer: {
            select: { id: true, name: true, email: true }
          }
        }
      });

      if (!sale) {
        throw new Error('Sale not found');
      }

      if (sale.paymentStatus !== 'PENDING') {
        throw new Error('Sale already completed');
      }

      if (sale.items.length === 0) {
        throw new Error('Cannot complete sale with no items');
      }

      const totalAmount = new Decimal(sale.total);
      const paidAmount = new Decimal(amountPaid);

      if (paidAmount.lt(totalAmount)) {
        throw new Error('Insufficient payment amount');
      }

      // Update stock quantities
      for (const item of sale.items) {
        await tx.product.update({
          where: { id: item.productId },
          data: {
            currentStock: {
              decrement: item.quantity
            }
          }
        });

        // Create stock movement record
        await tx.stockMovement.create({
          data: {
            productId: item.productId,
            type: 'SALE',
            quantity: -item.quantity,
            reference: sale.saleNumber,
            notes: `Sale completed by ${req.user.firstName} ${req.user.lastName}`
          }
        });
      }

      // Update sale status
      const updatedSale = await tx.sale.update({
        where: { id: saleId },
        data: {
          paymentMethod,
          paymentStatus: 'COMPLETED',
          notes
        },
        include: {
          items: {
            include: {
              product: {
                select: { id: true, name: true, sku: true }
              }
            }
          },
          customer: {
            select: { id: true, name: true, email: true, phone: true }
          },
          user: {
            select: { id: true, firstName: true, lastName: true }
          }
        }
      });

      // Create payment record
      const payment = await tx.payment.create({
        data: {
          saleId,
          amount: paidAmount,
          method: paymentMethod,
          status: 'COMPLETED',
          reference: paymentReference
        }
      });

      return { sale: updatedSale, payment, change: paidAmount.minus(totalAmount) };
    });

    // Log the completion
    await auditLog('SALE_COMPLETE', 'Sale', saleId, null, {
      saleNumber: result.sale.saleNumber,
      total: result.sale.total,
      paymentMethod
    }, req);

    // Broadcast sale completion
    if (result.sale.terminalId) {
      sendToTerminal(result.sale.terminalId, 'sale_completed', {
        sale: result.sale,
        payment: result.payment,
        change: result.change,
        completedBy: req.user.id
      });
    }

    // Update dashboard
    updateDashboard();

    logger.info(`Sale completed: ${result.sale.saleNumber} by ${req.user.email}`);

    res.json({
      message: 'Sale completed successfully',
      sale: result.sale,
      payment: result.payment,
      change: result.change
    });
  } catch (error) {
    logger.error('Sale completion error:', error);
    
    if (error.message.includes('not found') || error.message.includes('already completed') || 
        error.message.includes('no items') || error.message.includes('Insufficient')) {
      return res.status(400).json({ error: error.message });
    }
    
    res.status(500).json({ error: 'Failed to complete sale' });
  }
});

// Get sale details
router.get('/sale/:saleId', [authenticateToken, canProcessSales], async (req, res) => {
  try {
    const { saleId } = req.params;

    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      include: {
        items: {
          include: {
            product: {
              select: { id: true, name: true, sku: true, unit: true }
            }
          }
        },
        customer: {
          select: { id: true, name: true, email: true, phone: true }
        },
        user: {
          select: { id: true, firstName: true, lastName: true }
        },
        payments: true
      }
    });

    if (!sale) {
      return res.status(404).json({ error: 'Sale not found' });
    }

    res.json({ sale });
  } catch (error) {
    logger.error('Sale fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch sale' });
  }
});

// Generate receipt QR code
router.get('/sale/:saleId/qr', [authenticateToken, canProcessSales], async (req, res) => {
  try {
    const { saleId } = req.params;

    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      select: { saleNumber: true, total: true, createdAt: true }
    });

    if (!sale) {
      return res.status(404).json({ error: 'Sale not found' });
    }

    const receiptData = {
      saleNumber: sale.saleNumber,
      total: sale.total,
      date: sale.createdAt,
      url: `${req.protocol}://${req.get('host')}/receipt/${saleId}`
    };

    const qrCode = await QRCode.toDataURL(JSON.stringify(receiptData));

    res.json({ qrCode, receiptData });
  } catch (error) {
    logger.error('QR code generation error:', error);
    res.status(500).json({ error: 'Failed to generate QR code' });
  }
});

// Helper function to update sale totals
async function updateSaleTotals(saleId) {
  const saleItems = await prisma.saleItem.findMany({
    where: { saleId }
  });

  const subtotal = saleItems.reduce((sum, item) => {
    return sum.plus(new Decimal(item.total));
  }, new Decimal(0));

  const taxAmount = saleItems.reduce((sum, item) => {
    const itemSubtotal = new Decimal(item.unitPrice).mul(item.quantity).minus(item.discount);
    const itemTax = itemSubtotal.mul(item.taxRate).div(100);
    return sum.plus(itemTax);
  }, new Decimal(0));

  const total = subtotal;

  return await prisma.sale.update({
    where: { id: saleId },
    data: {
      subtotal: subtotal.minus(taxAmount),
      taxAmount,
      total
    },
    include: {
      items: {
        include: {
          product: {
            select: { id: true, name: true, sku: true, unit: true }
          }
        }
      }
    }
  });
}

module.exports = router;