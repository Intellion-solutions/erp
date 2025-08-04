const express = require('express');
const { body, validationResult } = require('express-validator');
const { PrismaClient } = require('@prisma/client');
const nodemailer = require('nodemailer');
const twilio = require('twilio');

const router = express.Router();
const prisma = new PrismaClient();

// Middleware to check if user is authenticated
const authenticateToken = require('../middleware/auth');

// Initialize Twilio client
const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

// Initialize email transporter
const emailTransporter = nodemailer.createTransporter({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

// Get user notifications
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      unreadOnly = false,
      type 
    } = req.query;

    const skip = (page - 1) * limit;
    
    const where = {
      userId: req.user.id
    };

    if (unreadOnly === 'true') {
      where.isRead = false;
    }

    if (type) {
      where.type = type;
    }

    const notifications = await prisma.notification.findMany({
      where,
      skip: parseInt(skip),
      take: parseInt(limit),
      orderBy: { createdAt: 'desc' }
    });

    const total = await prisma.notification.count({ where });
    const unreadCount = await prisma.notification.count({
      where: {
        userId: req.user.id,
        isRead: false
      }
    });

    res.json({
      notifications,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      },
      unreadCount
    });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

// Mark notification as read
router.patch('/:id/read', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const notification = await prisma.notification.update({
      where: {
        id,
        userId: req.user.id
      },
      data: {
        isRead: true
      }
    });

    res.json(notification);
  } catch (error) {
    console.error('Error marking notification as read:', error);
    res.status(500).json({ error: 'Failed to mark notification as read' });
  }
});

// Mark all notifications as read
router.patch('/read-all', authenticateToken, async (req, res) => {
  try {
    await prisma.notification.updateMany({
      where: {
        userId: req.user.id,
        isRead: false
      },
      data: {
        isRead: true
      }
    });

    res.json({ message: 'All notifications marked as read' });
  } catch (error) {
    console.error('Error marking all notifications as read:', error);
    res.status(500).json({ error: 'Failed to mark notifications as read' });
  }
});

// Delete notification
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    await prisma.notification.delete({
      where: {
        id,
        userId: req.user.id
      }
    });

    res.json({ message: 'Notification deleted successfully' });
  } catch (error) {
    console.error('Error deleting notification:', error);
    res.status(500).json({ error: 'Failed to delete notification' });
  }
});

// Send notification to user
router.post('/send', authenticateToken, [
  body('userId').isString().withMessage('User ID is required'),
  body('title').isString().withMessage('Title is required'),
  body('message').isString().withMessage('Message is required'),
  body('type').isIn(['EMAIL', 'SMS', 'PUSH', 'IN_APP']).withMessage('Invalid notification type'),
  body('priority').optional().isIn(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).withMessage('Invalid priority'),
  body('data').optional().isObject().withMessage('Data must be an object')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      userId,
      title,
      message,
      type,
      priority = 'MEDIUM',
      data = {}
    } = req.body;

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Create notification record
    const notification = await prisma.notification.create({
      data: {
        userId,
        type,
        title,
        message,
        priority,
        data
      }
    });

    // Send notification based on type
    switch (type) {
      case 'EMAIL':
        if (user.email) {
          await sendEmail(user.email, title, message);
        }
        break;
      
      case 'SMS':
        if (user.phone) {
          await sendSMS(user.phone, message);
        }
        break;
      
      case 'PUSH':
        // Implement push notification logic here
        // This would typically involve a service like Firebase Cloud Messaging
        break;
      
      case 'IN_APP':
        // Already created in database
        break;
    }

    res.status(201).json(notification);
  } catch (error) {
    console.error('Error sending notification:', error);
    res.status(500).json({ error: 'Failed to send notification' });
  }
});

// Send bulk notifications
router.post('/send-bulk', authenticateToken, [
  body('userIds').isArray().withMessage('User IDs array is required'),
  body('title').isString().withMessage('Title is required'),
  body('message').isString().withMessage('Message is required'),
  body('type').isIn(['EMAIL', 'SMS', 'PUSH', 'IN_APP']).withMessage('Invalid notification type'),
  body('priority').optional().isIn(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).withMessage('Invalid priority')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      userIds,
      title,
      message,
      type,
      priority = 'MEDIUM'
    } = req.body;

    // Get users
    const users = await prisma.user.findMany({
      where: {
        id: { in: userIds }
      }
    });

    // Create notifications
    const notifications = await Promise.all(
      users.map(user => 
        prisma.notification.create({
          data: {
            userId: user.id,
            type,
            title,
            message,
            priority
          }
        })
      )
    );

    // Send external notifications
    for (const user of users) {
      switch (type) {
        case 'EMAIL':
          if (user.email) {
            await sendEmail(user.email, title, message);
          }
          break;
        
        case 'SMS':
          if (user.phone) {
            await sendSMS(user.phone, message);
          }
          break;
      }
    }

    res.json({
      message: `Successfully sent ${notifications.length} notifications`,
      count: notifications.length
    });
  } catch (error) {
    console.error('Error sending bulk notifications:', error);
    res.status(500).json({ error: 'Failed to send bulk notifications' });
  }
});

// System notification templates
const notificationTemplates = {
  lowStock: (productName, currentStock) => ({
    title: 'Low Stock Alert',
    message: `${productName} is running low on stock. Current stock: ${currentStock}`,
    priority: 'HIGH'
  }),
  
  outOfStock: (productName) => ({
    title: 'Out of Stock Alert',
    message: `${productName} is now out of stock. Please reorder.`,
    priority: 'URGENT'
  }),
  
  newOrder: (orderNumber, total) => ({
    title: 'New Order Received',
    message: `Order #${orderNumber} received with total $${total}`,
    priority: 'MEDIUM'
  }),
  
  paymentReceived: (amount, method) => ({
    title: 'Payment Received',
    message: `Payment of $${amount} received via ${method}`,
    priority: 'MEDIUM'
  }),
  
  systemMaintenance: (startTime, duration) => ({
    title: 'System Maintenance',
    message: `System maintenance scheduled for ${startTime} (${duration} minutes)`,
    priority: 'HIGH'
  })
};

// Create system notification
router.post('/system', authenticateToken, [
  body('template').isString().withMessage('Template is required'),
  body('recipients').isIn(['ALL', 'MANAGERS', 'OWNERS']).withMessage('Invalid recipients'),
  body('data').isObject().withMessage('Data is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { template, recipients, data } = req.body;

    if (!notificationTemplates[template]) {
      return res.status(400).json({ error: 'Invalid template' });
    }

    // Get recipients based on criteria
    let where = {};
    switch (recipients) {
      case 'MANAGERS':
        where.role = { in: ['MANAGER', 'OWNER'] };
        break;
      case 'OWNERS':
        where.role = 'OWNER';
        break;
      case 'ALL':
        where = {};
        break;
    }

    const users = await prisma.user.findMany({
      where: {
        ...where,
        status: 'ACTIVE'
      }
    });

    const templateData = notificationTemplates[template](...Object.values(data));
    
    // Create notifications for all recipients
    const notifications = await Promise.all(
      users.map(user => 
        prisma.notification.create({
          data: {
            userId: user.id,
            type: 'IN_APP',
            title: templateData.title,
            message: templateData.message,
            priority: templateData.priority
          }
        })
      )
    );

    res.json({
      message: `System notification sent to ${notifications.length} users`,
      count: notifications.length
    });
  } catch (error) {
    console.error('Error creating system notification:', error);
    res.status(500).json({ error: 'Failed to create system notification' });
  }
});

// Helper function to send email
async function sendEmail(to, subject, message) {
  try {
    const mailOptions = {
      from: process.env.SMTP_USER,
      to,
      subject,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">${subject}</h2>
          <p style="color: #666; line-height: 1.6;">${message}</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
          <p style="color: #999; font-size: 12px;">
            This is an automated message from your ERP system.
          </p>
        </div>
      `
    };

    await emailTransporter.sendMail(mailOptions);
  } catch (error) {
    console.error('Error sending email:', error);
    throw error;
  }
}

// Helper function to send SMS
async function sendSMS(to, message) {
  try {
    await twilioClient.messages.create({
      body: message,
      from: process.env.TWILIO_PHONE_NUMBER,
      to
    });
  } catch (error) {
    console.error('Error sending SMS:', error);
    throw error;
  }
}

// Get notification settings for user
router.get('/settings', authenticateToken, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        preferences: true
      }
    });

    const notificationSettings = user?.preferences?.notifications || {
      email: true,
      sms: false,
      push: true,
      inApp: true,
      lowStock: true,
      newOrders: true,
      payments: true,
      systemMaintenance: true
    };

    res.json(notificationSettings);
  } catch (error) {
    console.error('Error fetching notification settings:', error);
    res.status(500).json({ error: 'Failed to fetch notification settings' });
  }
});

// Update notification settings
router.put('/settings', authenticateToken, [
  body('settings').isObject().withMessage('Settings must be an object')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { settings } = req.body;

    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: {
        preferences: {
          ...req.user.preferences,
          notifications: settings
        }
      }
    });

    res.json(user.preferences.notifications);
  } catch (error) {
    console.error('Error updating notification settings:', error);
    res.status(500).json({ error: 'Failed to update notification settings' });
  }
});

module.exports = router;