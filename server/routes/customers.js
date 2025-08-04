const express = require('express');
const { body, validationResult } = require('express-validator');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const router = express.Router();
const prisma = new PrismaClient();

// Middleware to check if user is authenticated
const authenticateToken = require('../middleware/auth');

// Get all customers with pagination and filtering
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      search, 
      type, 
      status,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const skip = (page - 1) * limit;
    
    // Build where clause
    const where = {};
    
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } }
      ];
    }
    
    if (type) {
      where.type = type;
    }
    
    if (status !== undefined) {
      where.isActive = status === 'true';
    }

    // Get customers with pagination
    const customers = await prisma.customer.findMany({
      where,
      skip: parseInt(skip),
      take: parseInt(limit),
      orderBy: { [sortBy]: sortOrder },
      include: {
        _count: {
          select: {
            sales: true,
            returns: true
          }
        }
      }
    });

    // Get total count for pagination
    const total = await prisma.customer.count({ where });

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
    console.error('Error fetching customers:', error);
    res.status(500).json({ error: 'Failed to fetch customers' });
  }
});

// Get customer by ID with detailed information
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
                firstName: true,
                lastName: true
              }
            }
          },
          orderBy: { createdAt: 'desc' },
          take: 10
        },
        returns: {
          orderBy: { createdAt: 'desc' },
          take: 5
        },
        loyaltyTransactions: {
          orderBy: { createdAt: 'desc' },
          take: 10
        },
        _count: {
          select: {
            sales: true,
            returns: true,
            loyaltyTransactions: true
          }
        }
      }
    });

    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    res.json(customer);
  } catch (error) {
    console.error('Error fetching customer:', error);
    res.status(500).json({ error: 'Failed to fetch customer' });
  }
});

// Create new customer
router.post('/', authenticateToken, [
  body('name').trim().isLength({ min: 1 }).withMessage('Name is required'),
  body('email').optional().isEmail().withMessage('Invalid email format'),
  body('phone').optional().isMobilePhone().withMessage('Invalid phone format'),
  body('type').optional().isIn(['RETAIL', 'WHOLESALE', 'VIP', 'CORPORATE']).withMessage('Invalid customer type'),
  body('creditLimit').optional().isNumeric().withMessage('Credit limit must be a number')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      name,
      email,
      phone,
      address,
      city,
      state,
      country,
      postalCode,
      taxId,
      creditLimit,
      type = 'RETAIL',
      notes
    } = req.body;

    // Check if email already exists
    if (email) {
      const existingCustomer = await prisma.customer.findFirst({
        where: { email }
      });
      
      if (existingCustomer) {
        return res.status(400).json({ error: 'Email already exists' });
      }
    }

    const customer = await prisma.customer.create({
      data: {
        name,
        email,
        phone,
        address,
        city,
        state,
        country,
        postalCode,
        taxId,
        creditLimit: creditLimit ? parseFloat(creditLimit) : null,
        type,
        notes
      }
    });

    res.status(201).json(customer);
  } catch (error) {
    console.error('Error creating customer:', error);
    res.status(500).json({ error: 'Failed to create customer' });
  }
});

// Update customer
router.put('/:id', authenticateToken, [
  body('name').optional().trim().isLength({ min: 1 }).withMessage('Name cannot be empty'),
  body('email').optional().isEmail().withMessage('Invalid email format'),
  body('phone').optional().isMobilePhone().withMessage('Invalid phone format'),
  body('type').optional().isIn(['RETAIL', 'WHOLESALE', 'VIP', 'CORPORATE']).withMessage('Invalid customer type'),
  body('creditLimit').optional().isNumeric().withMessage('Credit limit must be a number')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const updateData = req.body;

    // Check if email already exists (if being updated)
    if (updateData.email) {
      const existingCustomer = await prisma.customer.findFirst({
        where: {
          email: updateData.email,
          id: { not: id }
        }
      });
      
      if (existingCustomer) {
        return res.status(400).json({ error: 'Email already exists' });
      }
    }

    const customer = await prisma.customer.update({
      where: { id },
      data: updateData
    });

    res.json(customer);
  } catch (error) {
    console.error('Error updating customer:', error);
    res.status(500).json({ error: 'Failed to update customer' });
  }
});

// Delete customer
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // Check if customer has any sales
    const salesCount = await prisma.sale.count({
      where: { customerId: id }
    });

    if (salesCount > 0) {
      return res.status(400).json({ 
        error: 'Cannot delete customer with existing sales. Consider deactivating instead.' 
      });
    }

    await prisma.customer.delete({
      where: { id }
    });

    res.json({ message: 'Customer deleted successfully' });
  } catch (error) {
    console.error('Error deleting customer:', error);
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

    // Get customer sales data
    const sales = await prisma.sale.findMany({
      where: {
        customerId: id,
        createdAt: {
          gte: startDate
        }
      },
      select: {
        total: true,
        createdAt: true,
        items: {
          select: {
            quantity: true,
            unitPrice: true
          }
        }
      }
    });

    // Calculate analytics
    const totalSales = sales.reduce((sum, sale) => sum + parseFloat(sale.total), 0);
    const totalItems = sales.reduce((sum, sale) => 
      sum + sale.items.reduce((itemSum, item) => itemSum + item.quantity, 0), 0
    );
    const averageOrderValue = sales.length > 0 ? totalSales / sales.length : 0;

    // Get loyalty points
    const loyaltyPoints = await prisma.loyaltyTransaction.aggregate({
      where: { customerId: id },
      _sum: { points: true }
    });

    res.json({
      totalSales,
      totalOrders: sales.length,
      totalItems,
      averageOrderValue,
      loyaltyPoints: loyaltyPoints._sum.points || 0,
      salesTrend: sales.map(sale => ({
        date: sale.createdAt,
        amount: parseFloat(sale.total)
      }))
    });
  } catch (error) {
    console.error('Error fetching customer analytics:', error);
    res.status(500).json({ error: 'Failed to fetch customer analytics' });
  }
});

// Add loyalty points
router.post('/:id/loyalty', authenticateToken, [
  body('points').isInt({ min: 1 }).withMessage('Points must be a positive integer'),
  body('type').isIn(['EARN', 'REDEEM', 'EXPIRE']).withMessage('Invalid transaction type'),
  body('description').optional().trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const { points, type, description } = req.body;

    // Check if customer exists
    const customer = await prisma.customer.findUnique({
      where: { id }
    });

    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    // Create loyalty transaction
    const transaction = await prisma.loyaltyTransaction.create({
      data: {
        customerId: id,
        points: type === 'REDEEM' || type === 'EXPIRE' ? -points : points,
        type,
        description
      }
    });

    // Update customer loyalty points
    const newPoints = type === 'REDEEM' || type === 'EXPIRE' 
      ? customer.loyaltyPoints - points 
      : customer.loyaltyPoints + points;

    await prisma.customer.update({
      where: { id },
      data: { loyaltyPoints: Math.max(0, newPoints) }
    });

    res.json(transaction);
  } catch (error) {
    console.error('Error adding loyalty points:', error);
    res.status(500).json({ error: 'Failed to add loyalty points' });
  }
});

// Get customer search suggestions
router.get('/search/suggestions', authenticateToken, async (req, res) => {
  try {
    const { q } = req.query;
    
    if (!q || q.length < 2) {
      return res.json([]);
    }

    const customers = await prisma.customer.findMany({
      where: {
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { email: { contains: q, mode: 'insensitive' } },
          { phone: { contains: q, mode: 'insensitive' } }
        ],
        isActive: true
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        type: true,
        loyaltyPoints: true
      },
      take: 10
    });

    res.json(customers);
  } catch (error) {
    console.error('Error fetching customer suggestions:', error);
    res.status(500).json({ error: 'Failed to fetch suggestions' });
  }
});

// Bulk operations
router.post('/bulk', authenticateToken, async (req, res) => {
  try {
    const { action, customerIds } = req.body;

    if (!action || !customerIds || !Array.isArray(customerIds)) {
      return res.status(400).json({ error: 'Invalid request' });
    }

    let result;

    switch (action) {
      case 'activate':
        result = await prisma.customer.updateMany({
          where: { id: { in: customerIds } },
          data: { isActive: true }
        });
        break;
      
      case 'deactivate':
        result = await prisma.customer.updateMany({
          where: { id: { in: customerIds } },
          data: { isActive: false }
        });
        break;
      
      default:
        return res.status(400).json({ error: 'Invalid action' });
    }

    res.json({ 
      message: `Successfully ${action}d ${result.count} customers`,
      count: result.count 
    });
  } catch (error) {
    console.error('Error performing bulk operation:', error);
    res.status(500).json({ error: 'Failed to perform bulk operation' });
  }
});

module.exports = router;