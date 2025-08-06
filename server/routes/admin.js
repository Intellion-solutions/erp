const express = require('express');
const { body, validationResult } = require('express-validator');
const { PrismaClient } = require('@prisma/client');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { logger } = require('../utils/logger');
const { createAuditLog } = require('../services/auditService');
const { io } = require('../services/socketService');

const router = express.Router();
const prisma = new PrismaClient();

// ==================== ROLE & PERMISSION MANAGEMENT ====================

// Get all roles
router.get('/roles', authenticateToken, requireRole(['OWNER', 'MANAGER']), async (req, res) => {
  try {
    const roles = await prisma.userRole.findMany({
      include: {
        users: { select: { id: true, firstName: true, lastName: true } },
        permissions: {
          include: { permission: true }
        }
      }
    });
    res.json(roles);
  } catch (error) {
    logger.error('Error fetching roles:', error);
    res.status(500).json({ error: 'Failed to fetch roles' });
  }
});

// Create role
router.post('/roles', authenticateToken, requireRole(['OWNER']), [
  body('name').notEmpty(),
  body('description').optional(),
  body('permissions').isArray()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    
    const { name, description, permissions } = req.body;
    
    const role = await prisma.userRole.create({
      data: {
        name,
        description,
        permissions: {
          create: permissions.map(permissionId => ({ permissionId }))
        }
      },
      include: {
        permissions: { include: { permission: true } }
      }
    });
    
    await createAuditLog({
      userId: req.user.id,
      action: 'CREATE',
      entity: 'UserRole',
      entityId: role.id,
      newValues: role
    });
    
    res.status(201).json(role);
  } catch (error) {
    logger.error('Error creating role:', error);
    res.status(500).json({ error: 'Failed to create role' });
  }
});

// Update role
router.put('/roles/:id', authenticateToken, requireRole(['OWNER']), [
  body('name').optional(),
  body('description').optional(),
  body('isActive').optional().isBoolean(),
  body('permissions').optional().isArray()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    
    const { id } = req.params;
    const { name, description, isActive, permissions } = req.body;
    
    // Update role
    const role = await prisma.userRole.update({
      where: { id },
      data: { name, description, isActive }
    });
    
    // Update permissions if provided
    if (permissions) {
      await prisma.rolePermission.deleteMany({ where: { roleId: id } });
      await prisma.rolePermission.createMany({
        data: permissions.map(permissionId => ({ roleId: id, permissionId }))
      });
    }
    
    const updatedRole = await prisma.userRole.findUnique({
      where: { id },
      include: {
        permissions: { include: { permission: true } }
      }
    });
    
    await createAuditLog({
      userId: req.user.id,
      action: 'UPDATE',
      entity: 'UserRole',
      entityId: id,
      newValues: updatedRole
    });
    
    res.json(updatedRole);
  } catch (error) {
    logger.error('Error updating role:', error);
    res.status(500).json({ error: 'Failed to update role' });
  }
});

// Get all permissions
router.get('/permissions', authenticateToken, requireRole(['OWNER', 'MANAGER']), async (req, res) => {
  try {
    const permissions = await prisma.permission.findMany({
      include: {
        roles: { include: { role: true } }
      }
    });
    res.json(permissions);
  } catch (error) {
    logger.error('Error fetching permissions:', error);
    res.status(500).json({ error: 'Failed to fetch permissions' });
  }
});

// ==================== SYSTEM NOTIFICATIONS ====================

// Get all system notifications
router.get('/notifications', authenticateToken, requireRole(['OWNER', 'MANAGER']), async (req, res) => {
  try {
    const notifications = await prisma.systemNotification.findMany({
      include: { createdBy: true },
      orderBy: { createdAt: 'desc' }
    });
    res.json(notifications);
  } catch (error) {
    logger.error('Error fetching system notifications:', error);
    res.status(500).json({ error: 'Failed to fetch system notifications' });
  }
});

// Create system notification
router.post('/notifications', authenticateToken, requireRole(['OWNER', 'MANAGER']), [
  body('title').notEmpty(),
  body('message').notEmpty(),
  body('type').isIn(['INFO', 'SUCCESS', 'WARNING', 'ERROR']),
  body('priority').isIn(['LOW', 'NORMAL', 'HIGH', 'URGENT']),
  body('expiresAt').optional().isISO8601()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    
    const { title, message, type, priority, expiresAt } = req.body;
    
    const notification = await prisma.systemNotification.create({
      data: {
        title,
        message,
        type,
        priority,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        createdById: req.user.id
      }
    });
    
    await createAuditLog({
      userId: req.user.id,
      action: 'CREATE',
      entity: 'SystemNotification',
      entityId: notification.id,
      newValues: notification
    });
    
    // Emit real-time notification
    if (io) io.emit('systemNotification', notification);
    
    res.status(201).json(notification);
  } catch (error) {
    logger.error('Error creating system notification:', error);
    res.status(500).json({ error: 'Failed to create system notification' });
  }
});

// ==================== AUDIT LOG VIEWER ====================

// Get audit logs with advanced filtering
router.get('/audit-logs', authenticateToken, requireRole(['OWNER', 'MANAGER']), async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 50, 
      userId, 
      action, 
      entity, 
      startDate, 
      endDate,
      search 
    } = req.query;
    
    const skip = (page - 1) * limit;
    const where = {};
    
    if (userId) where.userId = userId;
    if (action) where.action = action;
    if (entity) where.entity = entity;
    if (startDate && endDate) {
      where.createdAt = {
        gte: new Date(startDate),
        lte: new Date(endDate)
      };
    }
    if (search) {
      where.OR = [
        { details: { contains: search, mode: 'insensitive' } },
        { user: { firstName: { contains: search, mode: 'insensitive' } } },
        { user: { lastName: { contains: search, mode: 'insensitive' } } }
      ];
    }
    
    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        include: {
          user: {
            select: { id: true, firstName: true, lastName: true, email: true }
          }
        },
        skip: parseInt(skip),
        take: parseInt(limit),
        orderBy: { createdAt: 'desc' }
      }),
      prisma.auditLog.count({ where })
    ]);
    
    res.json({
      logs,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    logger.error('Error fetching audit logs:', error);
    res.status(500).json({ error: 'Failed to fetch audit logs' });
  }
});

// Export audit logs to CSV
router.get('/audit-logs/export', authenticateToken, requireRole(['OWNER']), async (req, res) => {
  try {
    const logs = await prisma.auditLog.findMany({
      include: {
        user: {
          select: { firstName: true, lastName: true, email: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    
    const csvData = logs.map(log => ({
      Date: log.createdAt.toISOString(),
      User: `${log.user.firstName} ${log.user.lastName}`,
      Email: log.user.email,
      Action: log.action,
      Entity: log.entity,
      EntityID: log.entityId,
      Details: log.details
    }));
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="audit-logs.csv"');
    
    // Simple CSV generation
    const csv = [
      Object.keys(csvData[0]).join(','),
      ...csvData.map(row => Object.values(row).map(val => `"${val}"`).join(','))
    ].join('\n');
    
    res.send(csv);
  } catch (error) {
    logger.error('Error exporting audit logs:', error);
    res.status(500).json({ error: 'Failed to export audit logs' });
  }
});

// ==================== USER ACTIVITY MONITOR ====================

// Get active user sessions
router.get('/user-sessions', authenticateToken, requireRole(['OWNER', 'MANAGER']), async (req, res) => {
  try {
    const sessions = await prisma.userSession.findMany({
      where: { isActive: true },
      include: {
        user: {
          select: { id: true, firstName: true, lastName: true, email: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    
    res.json(sessions);
  } catch (error) {
    logger.error('Error fetching user sessions:', error);
    res.status(500).json({ error: 'Failed to fetch user sessions' });
  }
});

// Terminate user session
router.delete('/user-sessions/:id', authenticateToken, requireRole(['OWNER', 'MANAGER']), async (req, res) => {
  try {
    const { id } = req.params;
    
    await prisma.userSession.update({
      where: { id },
      data: { isActive: false }
    });
    
    await createAuditLog({
      userId: req.user.id,
      action: 'DELETE',
      entity: 'UserSession',
      entityId: id,
      details: 'Session terminated by admin'
    });
    
    res.json({ message: 'Session terminated successfully' });
  } catch (error) {
    logger.error('Error terminating user session:', error);
    res.status(500).json({ error: 'Failed to terminate session' });
  }
});

// Get user activity statistics
router.get('/user-activity', authenticateToken, requireRole(['OWNER', 'MANAGER']), async (req, res) => {
  try {
    const { period = '7' } = req.query; // days
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(period));
    
    const [activeUsers, totalSessions, recentLogins] = await Promise.all([
      prisma.userSession.count({
        where: { 
          isActive: true,
          createdAt: { gte: startDate }
        }
      }),
      prisma.userSession.count({
        where: { createdAt: { gte: startDate } }
      }),
      prisma.user.count({
        where: { lastLogin: { gte: startDate } }
      })
    ]);
    
    res.json({
      period: parseInt(period),
      activeUsers,
      totalSessions,
      recentLogins
    });
  } catch (error) {
    logger.error('Error fetching user activity:', error);
    res.status(500).json({ error: 'Failed to fetch user activity' });
  }
});

// ==================== THEME CUSTOMIZATION ====================

// Get all themes
router.get('/themes', authenticateToken, requireRole(['OWNER', 'MANAGER']), async (req, res) => {
  try {
    const themes = await prisma.theme.findMany({
      orderBy: { isDefault: 'desc' }
    });
    res.json(themes);
  } catch (error) {
    logger.error('Error fetching themes:', error);
    res.status(500).json({ error: 'Failed to fetch themes' });
  }
});

// Create theme
router.post('/themes', authenticateToken, requireRole(['OWNER']), [
  body('name').notEmpty(),
  body('description').optional(),
  body('primaryColor').notEmpty(),
  body('secondaryColor').notEmpty(),
  body('backgroundColor').notEmpty(),
  body('textColor').notEmpty()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    
    const { name, description, primaryColor, secondaryColor, backgroundColor, textColor } = req.body;
    
    const theme = await prisma.theme.create({
      data: {
        name,
        description,
        primaryColor,
        secondaryColor,
        backgroundColor,
        textColor
      }
    });
    
    await createAuditLog({
      userId: req.user.id,
      action: 'CREATE',
      entity: 'Theme',
      entityId: theme.id,
      newValues: theme
    });
    
    res.status(201).json(theme);
  } catch (error) {
    logger.error('Error creating theme:', error);
    res.status(500).json({ error: 'Failed to create theme' });
  }
});

// Set default theme
router.put('/themes/:id/set-default', authenticateToken, requireRole(['OWNER']), async (req, res) => {
  try {
    const { id } = req.params;
    
    // Remove default from all themes
    await prisma.theme.updateMany({
      data: { isDefault: false }
    });
    
    // Set new default
    const theme = await prisma.theme.update({
      where: { id },
      data: { isDefault: true }
    });
    
    await createAuditLog({
      userId: req.user.id,
      action: 'UPDATE',
      entity: 'Theme',
      entityId: id,
      details: 'Set as default theme'
    });
    
    // Emit theme change
    if (io) io.emit('themeUpdated', theme);
    
    res.json(theme);
  } catch (error) {
    logger.error('Error setting default theme:', error);
    res.status(500).json({ error: 'Failed to set default theme' });
  }
});

// ==================== SYSTEM STATISTICS ====================

// Get system overview
router.get('/system-overview', authenticateToken, requireRole(['OWNER', 'MANAGER']), async (req, res) => {
  try {
    const [
      totalUsers,
      activeUsers,
      totalSales,
      totalRevenue,
      totalProducts,
      lowStockProducts
    ] = await Promise.all([
      prisma.user.count(),
      prisma.userSession.count({ where: { isActive: true } }),
      prisma.sale.count(),
      prisma.sale.aggregate({ _sum: { total: true } }),
      prisma.product.count(),
      prisma.product.count({
        where: {
          stockQuantity: { lte: 10 }
        }
      })
    ]);
    
    res.json({
      totalUsers,
      activeUsers,
      totalSales,
      totalRevenue: totalRevenue._sum.total || 0,
      totalProducts,
      lowStockProducts
    });
  } catch (error) {
    logger.error('Error fetching system overview:', error);
    res.status(500).json({ error: 'Failed to fetch system overview' });
  }
});

module.exports = router;