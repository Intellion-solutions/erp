const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { logger } = require('../utils/logger');

const router = express.Router();
const prisma = new PrismaClient();

// Get audit logs
router.get('/', [
  authenticateToken,
  requireRole(['OWNER', 'MANAGER'])
], async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      userId, 
      action, 
      entity, 
      startDate, 
      endDate 
    } = req.query;
    const skip = (page - 1) * limit;

    const where = {};
    
    if (userId) {
      where.userId = userId;
    }

    if (action) {
      where.action = action;
    }

    if (entity) {
      where.entity = entity;
    }

    if (startDate && endDate) {
      where.createdAt = {
        gte: new Date(startDate),
        lte: new Date(endDate)
      };
    }

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
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

// Get audit log by ID
router.get('/:id', [
  authenticateToken,
  requireRole(['OWNER', 'MANAGER'])
], async (req, res) => {
  try {
    const { id } = req.params;
    
    const log = await prisma.auditLog.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true
          }
        }
      }
    });

    if (!log) {
      return res.status(404).json({ error: 'Audit log not found' });
    }

    res.json(log);
  } catch (error) {
    logger.error('Error fetching audit log:', error);
    res.status(500).json({ error: 'Failed to fetch audit log' });
  }
});

// Get audit summary
router.get('/summary/stats', [
  authenticateToken,
  requireRole(['OWNER', 'MANAGER'])
], async (req, res) => {
  try {
    const { period = '30' } = req.query; // days

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(period));

    const [totalLogs, logsByAction, logsByEntity, logsByUser] = await Promise.all([
      prisma.auditLog.count({
        where: { createdAt: { gte: startDate } }
      }),
      prisma.auditLog.groupBy({
        by: ['action'],
        where: { createdAt: { gte: startDate } },
        _count: { id: true }
      }),
      prisma.auditLog.groupBy({
        by: ['entity'],
        where: { createdAt: { gte: startDate } },
        _count: { id: true }
      }),
      prisma.auditLog.groupBy({
        by: ['userId'],
        where: { createdAt: { gte: startDate } },
        _count: { id: true }
      })
    ]);

    // Get user details for logs by user
    const userStats = await Promise.all(
      logsByUser.map(async (userLog) => {
        const user = await prisma.user.findUnique({
          where: { id: userLog.userId },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true
          }
        });
        return {
          user,
          count: userLog._count.id
        };
      })
    );

    const summary = {
      period: parseInt(period),
      totalLogs,
      logsByAction,
      logsByEntity,
      logsByUser: userStats
    };

    res.json(summary);
  } catch (error) {
    logger.error('Error fetching audit summary:', error);
    res.status(500).json({ error: 'Failed to fetch audit summary' });
  }
});

// Get user activity
router.get('/user/:userId', [
  authenticateToken,
  requireRole(['OWNER', 'MANAGER'])
], async (req, res) => {
  try {
    const { userId } = req.params;
    const { page = 1, limit = 10, startDate, endDate } = req.query;
    const skip = (page - 1) * limit;

    const where = { userId };
    
    if (startDate && endDate) {
      where.createdAt = {
        gte: new Date(startDate),
        lte: new Date(endDate)
      };
    }

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
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
    logger.error('Error fetching user activity:', error);
    res.status(500).json({ error: 'Failed to fetch user activity' });
  }
});

// Get entity audit trail
router.get('/entity/:entity/:entityId', [
  authenticateToken,
  requireRole(['OWNER', 'MANAGER'])
], async (req, res) => {
  try {
    const { entity, entityId } = req.params;
    const { page = 1, limit = 10 } = req.query;
    const skip = (page - 1) * limit;

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where: {
          entity,
          entityId
        },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          }
        },
        skip: parseInt(skip),
        take: parseInt(limit),
        orderBy: { createdAt: 'desc' }
      }),
      prisma.auditLog.count({
        where: {
          entity,
          entityId
        }
      })
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
    logger.error('Error fetching entity audit trail:', error);
    res.status(500).json({ error: 'Failed to fetch entity audit trail' });
  }
});

// Export audit logs
router.get('/export/csv', [
  authenticateToken,
  requireRole(['OWNER'])
], async (req, res) => {
  try {
    const { startDate, endDate, userId, action, entity } = req.query;

    const where = {};
    
    if (userId) {
      where.userId = userId;
    }

    if (action) {
      where.action = action;
    }

    if (entity) {
      where.entity = entity;
    }

    if (startDate && endDate) {
      where.createdAt = {
        gte: new Date(startDate),
        lte: new Date(endDate)
      };
    }

    const logs = await prisma.auditLog.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    const csvData = logs.map(log => ({
      'Date': log.createdAt.toISOString(),
      'User': log.user ? `${log.user.firstName} ${log.user.lastName}` : 'System',
      'Email': log.user?.email || '',
      'Action': log.action,
      'Entity': log.entity,
      'Entity ID': log.entityId,
      'IP Address': log.ipAddress || '',
      'User Agent': log.userAgent || ''
    }));

    // Convert to CSV
    const csvHeaders = Object.keys(csvData[0]);
    const csvContent = [
      csvHeaders.join(','),
      ...csvData.map(row => csvHeaders.map(header => `"${row[header]}"`).join(','))
    ].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="audit-logs.csv"');
    res.send(csvContent);
  } catch (error) {
    logger.error('Error exporting audit logs:', error);
    res.status(500).json({ error: 'Failed to export audit logs' });
  }
});

// Get audit log filters
router.get('/filters/options', [
  authenticateToken,
  requireRole(['OWNER', 'MANAGER'])
], async (req, res) => {
  try {
    const [actions, entities, users] = await Promise.all([
      prisma.auditLog.groupBy({
        by: ['action'],
        _count: { id: true }
      }),
      prisma.auditLog.groupBy({
        by: ['entity'],
        _count: { id: true }
      }),
      prisma.auditLog.groupBy({
        by: ['userId'],
        _count: { id: true }
      })
    ]);

    // Get user details for filter options
    const userOptions = await Promise.all(
      users.map(async (userLog) => {
        const user = await prisma.user.findUnique({
          where: { id: userLog.userId },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true
          }
        });
        return {
          id: userLog.userId,
          name: user ? `${user.firstName} ${user.lastName}` : 'Unknown',
          email: user?.email || '',
          count: userLog._count.id
        };
      })
    );

    const filters = {
      actions: actions.map(a => ({ action: a.action, count: a._count.id })),
      entities: entities.map(e => ({ entity: e.entity, count: e._count.id })),
      users: userOptions
    };

    res.json(filters);
  } catch (error) {
    logger.error('Error fetching audit filters:', error);
    res.status(500).json({ error: 'Failed to fetch audit filters' });
  }
});

module.exports = router;