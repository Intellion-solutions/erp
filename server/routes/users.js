const express = require('express');
const { body, validationResult, query } = require('express-validator');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const { logger } = require('../utils/logger');
const { authenticateToken, canManageUsers } = require('../middleware/auth');
const { auditLog } = require('../services/auditService');

const router = express.Router();
const prisma = new PrismaClient();

// Get all users with filtering and pagination
router.get('/', [
  authenticateToken,
  canManageUsers,
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('role').optional().isIn(['OWNER', 'MANAGER', 'SALESPERSON'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const where = {};
    
    if (req.query.search) {
      where.OR = [
        { firstName: { contains: req.query.search, mode: 'insensitive' } },
        { lastName: { contains: req.query.search, mode: 'insensitive' } },
        { email: { contains: req.query.search, mode: 'insensitive' } }
      ];
    }

    if (req.query.role) {
      where.role = req.query.role;
    }

    if (req.query.status) {
      where.status = req.query.status;
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          username: true,
          firstName: true,
          lastName: true,
          phone: true,
          role: true,
          status: true,
          lastLogin: true,
          createdAt: true,
          updatedAt: true
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit
      }),
      prisma.user.count({ where })
    ]);

    res.json({
      users,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    logger.error('Users fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Get single user
router.get('/:id', [authenticateToken, canManageUsers], async (req, res) => {
  try {
    const { id } = req.params;

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        username: true,
        firstName: true,
        lastName: true,
        phone: true,
        role: true,
        status: true,
        lastLogin: true,
        createdAt: true,
        updatedAt: true
      }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user });
  } catch (error) {
    logger.error('User fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// Create new user
router.post('/', [
  authenticateToken,
  canManageUsers,
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 8 }).matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/),
  body('firstName').trim().isLength({ min: 1 }),
  body('lastName').trim().isLength({ min: 1 }),
  body('role').isIn(['OWNER', 'MANAGER', 'SALESPERSON']),
  body('phone').optional().isMobilePhone()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password, firstName, lastName, role, phone, username } = req.body;

    // Check if user already exists
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [
          { email },
          ...(username ? [{ username }] : [])
        ]
      }
    });

    if (existingUser) {
      return res.status(400).json({ 
        error: 'User already exists with this email or username' 
      });
    }

    // Hash password
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        firstName,
        lastName,
        role,
        phone,
        username
      },
      select: {
        id: true,
        email: true,
        username: true,
        firstName: true,
        lastName: true,
        phone: true,
        role: true,
        status: true,
        createdAt: true
      }
    });

    // Log the creation
    await auditLog('USER_CREATE', 'User', user.id, null, user, req);

    logger.info(`User created: ${user.email} with role ${user.role} by ${req.user.email}`);

    res.status(201).json({
      message: 'User created successfully',
      user
    });
  } catch (error) {
    logger.error('User creation error:', error);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// Update user
router.put('/:id', [
  authenticateToken,
  canManageUsers,
  body('email').optional().isEmail().normalizeEmail(),
  body('firstName').optional().trim().isLength({ min: 1 }),
  body('lastName').optional().trim().isLength({ min: 1 }),
  body('role').optional().isIn(['OWNER', 'MANAGER', 'SALESPERSON']),
  body('status').optional().isIn(['ACTIVE', 'INACTIVE', 'SUSPENDED']),
  body('phone').optional().isMobilePhone()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const updateData = { ...req.body };
    delete updateData.password; // Don't allow password updates through this endpoint

    // Get current user
    const currentUser = await prisma.user.findUnique({
      where: { id }
    });

    if (!currentUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check for email/username conflicts
    if (updateData.email || updateData.username) {
      const conflictWhere = {
        AND: [
          { id: { not: id } },
          {
            OR: []
          }
        ]
      };

      if (updateData.email) conflictWhere.AND[1].OR.push({ email: updateData.email });
      if (updateData.username) conflictWhere.AND[1].OR.push({ username: updateData.username });

      const existingUser = await prisma.user.findFirst({
        where: conflictWhere
      });

      if (existingUser) {
        return res.status(400).json({ 
          error: 'Another user with this email or username already exists' 
        });
      }
    }

    const updatedUser = await prisma.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        email: true,
        username: true,
        firstName: true,
        lastName: true,
        phone: true,
        role: true,
        status: true,
        lastLogin: true,
        updatedAt: true
      }
    });

    // Log the update
    await auditLog('USER_UPDATE', 'User', id, currentUser, updatedUser, req);

    logger.info(`User updated: ${updatedUser.email} by ${req.user.email}`);

    res.json({
      message: 'User updated successfully',
      user: updatedUser
    });
  } catch (error) {
    logger.error('User update error:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// Reset user password
router.post('/:id/reset-password', [
  authenticateToken,
  canManageUsers,
  body('newPassword').isLength({ min: 8 }).matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const { newPassword } = req.body;

    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true, firstName: true, lastName: true }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Hash new password
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

    await prisma.user.update({
      where: { id },
      data: { password: hashedPassword }
    });

    // Log the password reset
    await auditLog('PASSWORD_RESET', 'User', id, null, { 
      resetBy: req.user.id,
      targetUser: user.email 
    }, req);

    logger.info(`Password reset for user: ${user.email} by ${req.user.email}`);

    res.json({ message: 'Password reset successfully' });
  } catch (error) {
    logger.error('Password reset error:', error);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

// Delete user
router.delete('/:id', [authenticateToken, canManageUsers], async (req, res) => {
  try {
    const { id } = req.params;

    // Prevent self-deletion
    if (id === req.user.id) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    const user = await prisma.user.findUnique({
      where: { id },
      include: {
        sales: { take: 1 },
        purchases: { take: 1 }
      }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if user has associated transactions
    if (user.sales.length > 0 || user.purchases.length > 0) {
      // Soft delete - deactivate account
      const updatedUser = await prisma.user.update({
        where: { id },
        data: { status: 'INACTIVE' },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          status: true
        }
      });

      await auditLog('USER_DEACTIVATE', 'User', id, user, updatedUser, req);

      return res.json({
        message: 'User account deactivated (cannot delete due to transaction history)',
        user: updatedUser
      });
    }

    // Hard delete if no transaction history
    await prisma.user.delete({
      where: { id }
    });

    await auditLog('USER_DELETE', 'User', id, user, null, req);

    logger.info(`User deleted: ${user.email} by ${req.user.email}`);

    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    logger.error('User deletion error:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// Get user statistics
router.get('/:id/stats', [authenticateToken, canManageUsers], async (req, res) => {
  try {
    const { id } = req.params;

    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true, firstName: true, lastName: true, role: true }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const [
      totalSales,
      salesCount,
      totalPurchases,
      purchasesCount,
      recentActivity
    ] = await Promise.all([
      prisma.sale.aggregate({
        where: { userId: id },
        _sum: { total: true }
      }),
      prisma.sale.count({
        where: { userId: id }
      }),
      prisma.purchase.aggregate({
        where: { userId: id },
        _sum: { total: true }
      }),
      prisma.purchase.count({
        where: { userId: id }
      }),
      prisma.auditLog.findMany({
        where: { userId: id },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true,
          action: true,
          entity: true,
          createdAt: true
        }
      })
    ]);

    const stats = {
      user,
      sales: {
        total: totalSales._sum.total || 0,
        count: salesCount
      },
      purchases: {
        total: totalPurchases._sum.total || 0,
        count: purchasesCount
      },
      recentActivity
    };

    res.json({ stats });
  } catch (error) {
    logger.error('User stats error:', error);
    res.status(500).json({ error: 'Failed to fetch user statistics' });
  }
});

module.exports = router;