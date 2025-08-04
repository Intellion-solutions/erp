const express = require('express');
const { body, validationResult } = require('express-validator');
const { PrismaClient } = require('@prisma/client');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { logger } = require('../utils/logger');
const { createAuditLog } = require('../services/auditService');

const router = express.Router();
const prisma = new PrismaClient();

// Get all suppliers
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { page = 1, limit = 10, search } = req.query;
    const skip = (page - 1) * limit;

    const where = {};
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
        { contactPerson: { contains: search, mode: 'insensitive' } }
      ];
    }

    const [suppliers, total] = await Promise.all([
      prisma.supplier.findMany({
        where,
        include: {
          _count: {
            select: { products: true, purchases: true }
          }
        },
        skip: parseInt(skip),
        take: parseInt(limit),
        orderBy: { name: 'asc' }
      }),
      prisma.supplier.count({ where })
    ]);

    res.json({
      suppliers,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    logger.error('Error fetching suppliers:', error);
    res.status(500).json({ error: 'Failed to fetch suppliers' });
  }
});

// Get supplier by ID
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const supplier = await prisma.supplier.findUnique({
      where: { id },
      include: {
        products: {
          include: {
            category: true
          }
        },
        purchases: {
          include: {
            items: {
              include: {
                product: true
              }
            },
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true
              }
            }
          },
          orderBy: { createdAt: 'desc' }
        },
        _count: {
          select: { products: true, purchases: true }
        }
      }
    });

    if (!supplier) {
      return res.status(404).json({ error: 'Supplier not found' });
    }

    res.json(supplier);
  } catch (error) {
    logger.error('Error fetching supplier:', error);
    res.status(500).json({ error: 'Failed to fetch supplier' });
  }
});

// Create new supplier
router.post('/', [
  authenticateToken,
  requireRole(['OWNER', 'MANAGER']),
  body('name').trim().isLength({ min: 1 }).withMessage('Name is required'),
  body('email').optional().isEmail().withMessage('Invalid email format'),
  body('phone').optional().trim(),
  body('address').optional().trim(),
  body('contactPerson').optional().trim(),
  body('taxId').optional().trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, email, phone, address, contactPerson, taxId } = req.body;

    const supplier = await prisma.supplier.create({
      data: {
        name,
        email,
        phone,
        address,
        contactPerson,
        taxId
      }
    });

    // Create audit log
    await createAuditLog({
      userId: req.user.id,
      action: 'CREATE',
      entity: 'Supplier',
      entityId: supplier.id,
      newValues: supplier
    });

    res.status(201).json(supplier);
  } catch (error) {
    logger.error('Error creating supplier:', error);
    res.status(500).json({ error: 'Failed to create supplier' });
  }
});

// Update supplier
router.put('/:id', [
  authenticateToken,
  requireRole(['OWNER', 'MANAGER']),
  body('name').optional().trim().isLength({ min: 1 }).withMessage('Name cannot be empty'),
  body('email').optional().isEmail().withMessage('Invalid email format'),
  body('phone').optional().trim(),
  body('address').optional().trim(),
  body('contactPerson').optional().trim(),
  body('taxId').optional().trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const { name, email, phone, address, contactPerson, taxId } = req.body;

    // Check if supplier exists
    const existingSupplier = await prisma.supplier.findUnique({
      where: { id }
    });

    if (!existingSupplier) {
      return res.status(404).json({ error: 'Supplier not found' });
    }

    const oldValues = existingSupplier;
    const supplier = await prisma.supplier.update({
      where: { id },
      data: {
        name,
        email,
        phone,
        address,
        contactPerson,
        taxId
      }
    });

    // Create audit log
    await createAuditLog({
      userId: req.user.id,
      action: 'UPDATE',
      entity: 'Supplier',
      entityId: supplier.id,
      oldValues,
      newValues: supplier
    });

    res.json(supplier);
  } catch (error) {
    logger.error('Error updating supplier:', error);
    res.status(500).json({ error: 'Failed to update supplier' });
  }
});

// Delete supplier
router.delete('/:id', [
  authenticateToken,
  requireRole(['OWNER', 'MANAGER'])
], async (req, res) => {
  try {
    const { id } = req.params;

    // Check if supplier exists and has related data
    const supplier = await prisma.supplier.findUnique({
      where: { id },
      include: {
        products: true,
        purchases: true
      }
    });

    if (!supplier) {
      return res.status(404).json({ error: 'Supplier not found' });
    }

    // Check if supplier has products
    if (supplier.products.length > 0) {
      return res.status(400).json({ 
        error: 'Cannot delete supplier with products. Please reassign or delete products first.' 
      });
    }

    // Check if supplier has purchases
    if (supplier.purchases.length > 0) {
      return res.status(400).json({ 
        error: 'Cannot delete supplier with purchase history. Purchase records must be preserved.' 
      });
    }

    await prisma.supplier.delete({
      where: { id }
    });

    // Create audit log
    await createAuditLog({
      userId: req.user.id,
      action: 'DELETE',
      entity: 'Supplier',
      entityId: id,
      oldValues: supplier
    });

    res.json({ message: 'Supplier deleted successfully' });
  } catch (error) {
    logger.error('Error deleting supplier:', error);
    res.status(500).json({ error: 'Failed to delete supplier' });
  }
});

// Get supplier performance analytics
router.get('/:id/analytics', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { period = '30' } = req.query; // days

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(period));

    const [supplier, purchases, totalSpent, avgOrderValue] = await Promise.all([
      prisma.supplier.findUnique({
        where: { id },
        include: {
          _count: {
            select: { products: true, purchases: true }
          }
        }
      }),
      prisma.purchase.findMany({
        where: {
          supplierId: id,
          createdAt: { gte: startDate }
        },
        include: {
          items: true
        },
        orderBy: { createdAt: 'desc' }
      }),
      prisma.purchase.aggregate({
        where: {
          supplierId: id,
          createdAt: { gte: startDate }
        },
        _sum: { total: true }
      }),
      prisma.purchase.aggregate({
        where: {
          supplierId: id,
          createdAt: { gte: startDate }
        },
        _avg: { total: true }
      })
    ]);

    if (!supplier) {
      return res.status(404).json({ error: 'Supplier not found' });
    }

    const analytics = {
      supplier,
      period: parseInt(period),
      purchases: purchases.length,
      totalSpent: totalSpent._sum.total || 0,
      avgOrderValue: avgOrderValue._avg.total || 0,
      recentPurchases: purchases.slice(0, 10)
    };

    res.json(analytics);
  } catch (error) {
    logger.error('Error fetching supplier analytics:', error);
    res.status(500).json({ error: 'Failed to fetch supplier analytics' });
  }
});

// Get supplier products
router.get('/:id/products', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 10 } = req.query;
    const skip = (page - 1) * limit;

    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where: { supplierId: id },
        include: {
          category: true,
          supplier: true
        },
        skip: parseInt(skip),
        take: parseInt(limit),
        orderBy: { name: 'asc' }
      }),
      prisma.product.count({
        where: { supplierId: id }
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
    logger.error('Error fetching supplier products:', error);
    res.status(500).json({ error: 'Failed to fetch supplier products' });
  }
});

module.exports = router;