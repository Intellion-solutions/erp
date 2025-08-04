const express = require('express');
const { body, validationResult } = require('express-validator');
const { PrismaClient } = require('@prisma/client');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { logger } = require('../utils/logger');
const { createAuditLog } = require('../services/auditService');

const router = express.Router();
const prisma = new PrismaClient();

// Get all customers
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
        { taxId: { contains: search, mode: 'insensitive' } }
      ];
    }

    const [customers, total] = await Promise.all([
      prisma.customer.findMany({
        where,
        include: {
          _count: {
            select: { sales: true }
          }
        },
        skip: parseInt(skip),
        take: parseInt(limit),
        orderBy: { name: 'asc' }
      }),
      prisma.customer.count({ where })
    ]);

    res.json({
      customers,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    logger.error('Error fetching customers:', error);
    res.status(500).json({ error: 'Failed to fetch customers' });
  }
});

// Get customer by ID
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const customer = await prisma.customer.findUnique({
      where: { id },
      include: {
        sales: {
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
          select: { sales: true }
        }
      }
    });

    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    res.json(customer);
  } catch (error) {
    logger.error('Error fetching customer:', error);
    res.status(500).json({ error: 'Failed to fetch customer' });
  }
});

// Create new customer
router.post('/', [
  authenticateToken,
  body('name').trim().isLength({ min: 1 }).withMessage('Name is required'),
  body('email').optional().isEmail().withMessage('Invalid email format'),
  body('phone').optional().trim(),
  body('address').optional().trim(),
  body('taxId').optional().trim(),
  body('creditLimit').optional().isFloat({ min: 0 }).withMessage('Credit limit must be a positive number')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, email, phone, address, taxId, creditLimit } = req.body;

    const customer = await prisma.customer.create({
      data: {
        name,
        email,
        phone,
        address,
        taxId,
        creditLimit: creditLimit ? parseFloat(creditLimit) : null
      }
    });

    // Create audit log
    await createAuditLog({
      userId: req.user.id,
      action: 'CREATE',
      entity: 'Customer',
      entityId: customer.id,
      newValues: customer
    });

    res.status(201).json(customer);
  } catch (error) {
    logger.error('Error creating customer:', error);
    res.status(500).json({ error: 'Failed to create customer' });
  }
});

// Update customer
router.put('/:id', [
  authenticateToken,
  body('name').optional().trim().isLength({ min: 1 }).withMessage('Name cannot be empty'),
  body('email').optional().isEmail().withMessage('Invalid email format'),
  body('phone').optional().trim(),
  body('address').optional().trim(),
  body('taxId').optional().trim(),
  body('creditLimit').optional().isFloat({ min: 0 }).withMessage('Credit limit must be a positive number')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const { name, email, phone, address, taxId, creditLimit } = req.body;

    // Check if customer exists
    const existingCustomer = await prisma.customer.findUnique({
      where: { id }
    });

    if (!existingCustomer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    const oldValues = existingCustomer;
    const customer = await prisma.customer.update({
      where: { id },
      data: {
        name,
        email,
        phone,
        address,
        taxId,
        creditLimit: creditLimit ? parseFloat(creditLimit) : null
      }
    });

    // Create audit log
    await createAuditLog({
      userId: req.user.id,
      action: 'UPDATE',
      entity: 'Customer',
      entityId: customer.id,
      oldValues,
      newValues: customer
    });

    res.json(customer);
  } catch (error) {
    logger.error('Error updating customer:', error);
    res.status(500).json({ error: 'Failed to update customer' });
  }
});

// Delete customer
router.delete('/:id', [
  authenticateToken,
  requireRole(['OWNER', 'MANAGER'])
], async (req, res) => {
  try {
    const { id } = req.params;

    // Check if customer exists and has related data
    const customer = await prisma.customer.findUnique({
      where: { id },
      include: {
        sales: true
      }
    });

    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    // Check if customer has sales history
    if (customer.sales.length > 0) {
      return res.status(400).json({ 
        error: 'Cannot delete customer with sales history. Sales records must be preserved.' 
      });
    }

    await prisma.customer.delete({
      where: { id }
    });

    // Create audit log
    await createAuditLog({
      userId: req.user.id,
      action: 'DELETE',
      entity: 'Customer',
      entityId: id,
      oldValues: customer
    });

    res.json({ message: 'Customer deleted successfully' });
  } catch (error) {
    logger.error('Error deleting customer:', error);
    res.status(500).json({ error: 'Failed to delete customer' });
  }
});

// Get customer analytics
router.get('/:id/analytics', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { period = '30' } = req.query; // days

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(period));

    const [customer, sales, totalSpent, avgOrderValue] = await Promise.all([
      prisma.customer.findUnique({
        where: { id },
        include: {
          _count: {
            select: { sales: true }
          }
        }
      }),
      prisma.sale.findMany({
        where: {
          customerId: id,
          createdAt: { gte: startDate }
        },
        include: {
          items: {
            include: {
              product: true
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      }),
      prisma.sale.aggregate({
        where: {
          customerId: id,
          createdAt: { gte: startDate }
        },
        _sum: { total: true }
      }),
      prisma.sale.aggregate({
        where: {
          customerId: id,
          createdAt: { gte: startDate }
        },
        _avg: { total: true }
      })
    ]);

    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    const analytics = {
      customer,
      period: parseInt(period),
      sales: sales.length,
      totalSpent: totalSpent._sum.total || 0,
      avgOrderValue: avgOrderValue._avg.total || 0,
      recentSales: sales.slice(0, 10)
    };

    res.json(analytics);
  } catch (error) {
    logger.error('Error fetching customer analytics:', error);
    res.status(500).json({ error: 'Failed to fetch customer analytics' });
  }
});

// Get customer purchase history
router.get('/:id/purchases', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 10 } = req.query;
    const skip = (page - 1) * limit;

    const [sales, total] = await Promise.all([
      prisma.sale.findMany({
        where: { customerId: id },
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
        skip: parseInt(skip),
        take: parseInt(limit),
        orderBy: { createdAt: 'desc' }
      }),
      prisma.sale.count({
        where: { customerId: id }
      })
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
    logger.error('Error fetching customer purchases:', error);
    res.status(500).json({ error: 'Failed to fetch customer purchases' });
  }
});

module.exports = router;