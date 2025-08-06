const express = require('express');
const { body, validationResult } = require('express-validator');
const { PrismaClient } = require('@prisma/client');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { logger } = require('../utils/logger');

const router = express.Router();
const prisma = new PrismaClient();

// Get user notifications
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { page = 1, limit = 10, read } = req.query;
    const skip = (page - 1) * limit;

    const where = { userId: req.user.id };
    
    if (read !== undefined) {
      where.read = read === 'true';
    }

    const [notifications, total] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: parseInt(skip),
        take: parseInt(limit)
      }),
      prisma.notification.count({ where })
    ]);

    res.json({
      notifications,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    logger.error('Error fetching notifications:', error);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

// Get notification by ID
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const notification = await prisma.notification.findFirst({
      where: {
        id,
        userId: req.user.id
      }
    });

    if (!notification) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    res.json(notification);
  } catch (error) {
    logger.error('Error fetching notification:', error);
    res.status(500).json({ error: 'Failed to fetch notification' });
  }
});

// Mark notification as read
router.put('/:id/read', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const notification = await prisma.notification.findFirst({
      where: {
        id,
        userId: req.user.id
      }
    });

    if (!notification) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    const updatedNotification = await prisma.notification.update({
      where: { id },
      data: { read: true }
    });

    res.json(updatedNotification);
  } catch (error) {
    logger.error('Error marking notification as read:', error);
    res.status(500).json({ error: 'Failed to mark notification as read' });
  }
});

// Mark all notifications as read
router.put('/read-all', authenticateToken, async (req, res) => {
  try {
    await prisma.notification.updateMany({
      where: {
        userId: req.user.id,
        read: false
      },
      data: { read: true }
    });

    res.json({ message: 'All notifications marked as read' });
  } catch (error) {
    logger.error('Error marking all notifications as read:', error);
    res.status(500).json({ error: 'Failed to mark all notifications as read' });
  }
});

// Delete notification
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const notification = await prisma.notification.findFirst({
      where: {
        id,
        userId: req.user.id
      }
    });

    if (!notification) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    await prisma.notification.delete({
      where: { id }
    });

    res.json({ message: 'Notification deleted successfully' });
  } catch (error) {
    logger.error('Error deleting notification:', error);
    res.status(500).json({ error: 'Failed to delete notification' });
  }
});

// Get notification count
router.get('/count/unread', authenticateToken, async (req, res) => {
  try {
    const count = await prisma.notification.count({
      where: {
        userId: req.user.id,
        read: false
      }
    });

    res.json({ count });
  } catch (error) {
    logger.error('Error fetching notification count:', error);
    res.status(500).json({ error: 'Failed to fetch notification count' });
  }
});

// Create notification (admin only)
router.post('/', [
  authenticateToken,
  requireRole(['OWNER', 'MANAGER'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { userId, title, message, type = 'INFO', data } = req.body;

    // Validate user exists
    if (userId) {
      const user = await prisma.user.findUnique({
        where: { id: userId }
      });
      if (!user) {
        return res.status(400).json({ error: 'User not found' });
      }
    }

    const notification = await prisma.notification.create({
      data: {
        userId,
        title,
        message,
        type,
        data: data || {}
      }
    });

    res.status(201).json(notification);
  } catch (error) {
    logger.error('Error creating notification:', error);
    res.status(500).json({ error: 'Failed to create notification' });
  }
});

// Create bulk notifications (admin only)
router.post('/bulk', [
  authenticateToken,
  requireRole(['OWNER', 'MANAGER'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { userIds, title, message, type = 'INFO', data } = req.body;

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ error: 'User IDs array is required' });
    }

    // Validate all users exist
    const users = await prisma.user.findMany({
      where: {
        id: { in: userIds }
      }
    });

    if (users.length !== userIds.length) {
      return res.status(400).json({ error: 'One or more users not found' });
    }

    const notifications = await Promise.all(
      userIds.map(userId =>
        prisma.notification.create({
          data: {
            userId,
            title,
            message,
            type,
            data: data || {}
          }
        })
      )
    );

    res.status(201).json({
      message: `Created ${notifications.length} notifications`,
      notifications
    });
  } catch (error) {
    logger.error('Error creating bulk notifications:', error);
    res.status(500).json({ error: 'Failed to create bulk notifications' });
  }
});

// Get system notifications (admin only)
router.get('/system/all', [
  authenticateToken,
  requireRole(['OWNER', 'MANAGER'])
], async (req, res) => {
  try {
    const { page = 1, limit = 10, userId, type, read } = req.query;
    const skip = (page - 1) * limit;

    const where = {};
    
    if (userId) {
      where.userId = userId;
    }

    if (type) {
      where.type = type;
    }

    if (read !== undefined) {
      where.read = read === 'true';
    }

    const [notifications, total] = await Promise.all([
      prisma.notification.findMany({
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
        orderBy: { createdAt: 'desc' },
        skip: parseInt(skip),
        take: parseInt(limit)
      }),
      prisma.notification.count({ where })
    ]);

    res.json({
      notifications,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    logger.error('Error fetching system notifications:', error);
    res.status(500).json({ error: 'Failed to fetch system notifications' });
  }
});

// Delete system notification (admin only)
router.delete('/system/:id', [
  authenticateToken,
  requireRole(['OWNER', 'MANAGER'])
], async (req, res) => {
  try {
    const { id } = req.params;
    
    const notification = await prisma.notification.findUnique({
      where: { id }
    });

    if (!notification) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    await prisma.notification.delete({
      where: { id }
    });

    res.json({ message: 'Notification deleted successfully' });
  } catch (error) {
    logger.error('Error deleting system notification:', error);
    res.status(500).json({ error: 'Failed to delete system notification' });
  }
});

// Get notification statistics (admin only)
router.get('/stats/summary', [
  authenticateToken,
  requireRole(['OWNER', 'MANAGER'])
], async (req, res) => {
  try {
    const { period = '30' } = req.query; // days

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(period));

    const [totalNotifications, unreadNotifications, notificationsByType, notificationsByUser] = await Promise.all([
      prisma.notification.count({
        where: { createdAt: { gte: startDate } }
      }),
      prisma.notification.count({
        where: {
          createdAt: { gte: startDate },
          read: false
        }
      }),
      prisma.notification.groupBy({
        by: ['type'],
        where: { createdAt: { gte: startDate } },
        _count: { id: true }
      }),
      prisma.notification.groupBy({
        by: ['userId'],
        where: { createdAt: { gte: startDate } },
        _count: { id: true }
      })
    ]);

    // Get user details for notifications by user
    const userStats = await Promise.all(
      notificationsByUser.map(async (userNotif) => {
        const user = await prisma.user.findUnique({
          where: { id: userNotif.userId },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true
          }
        });
        return {
          user,
          count: userNotif._count.id
        };
      })
    );

    const stats = {
      period: parseInt(period),
      totalNotifications,
      unreadNotifications,
      readNotifications: totalNotifications - unreadNotifications,
      notificationsByType,
      notificationsByUser: userStats
    };

    res.json(stats);
  } catch (error) {
    logger.error('Error fetching notification statistics:', error);
    res.status(500).json({ error: 'Failed to fetch notification statistics' });
  }
});

module.exports = router;