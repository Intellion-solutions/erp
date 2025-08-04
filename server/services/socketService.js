const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const { logger } = require('../utils/logger');
const { getRedisClient } = require('../config/redis');

const prisma = new PrismaClient();
let io;
const connectedUsers = new Map(); // userId -> socketId
const connectedTerminals = new Map(); // terminalId -> socketId

const initializeSocket = (socketIO) => {
  io = socketIO;

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      if (!token) {
        return next(new Error('Authentication token required'));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          status: true
        }
      });

      if (!user || user.status !== 'ACTIVE') {
        return next(new Error('Invalid token or inactive user'));
      }

      socket.user = user;
      next();
    } catch (error) {
      logger.error('Socket authentication error:', error);
      next(new Error('Authentication failed'));
    }
  });

  io.on('connection', (socket) => {
    logger.info(`User connected: ${socket.user.email} (${socket.id})`);
    
    // Store user connection
    connectedUsers.set(socket.user.id, socket.id);
    
    // Join user to their role-based room
    socket.join(`role:${socket.user.role.toLowerCase()}`);
    socket.join(`user:${socket.user.id}`);

    // Handle POS terminal registration
    socket.on('register_terminal', (terminalId) => {
      if (terminalId) {
        connectedTerminals.set(terminalId, socket.id);
        socket.terminalId = terminalId;
        socket.join(`terminal:${terminalId}`);
        logger.info(`Terminal registered: ${terminalId} by ${socket.user.email}`);
        
        // Notify other terminals about the new connection
        socket.to('terminals').emit('terminal_connected', {
          terminalId,
          user: socket.user,
          timestamp: new Date()
        });
      }
    });

    // Handle POS sync events
    socket.on('pos_sync', (data) => {
      // Broadcast to all terminals except sender
      socket.broadcast.to('terminals').emit('pos_sync', {
        ...data,
        from: socket.user.id,
        timestamp: new Date()
      });
    });

    // Handle inventory updates
    socket.on('inventory_update', (data) => {
      // Broadcast to managers and owners
      io.to('role:manager').to('role:owner').emit('inventory_updated', {
        ...data,
        updatedBy: socket.user.id,
        timestamp: new Date()
      });
    });

    // Handle real-time notifications
    socket.on('send_notification', (data) => {
      if (socket.user.role === 'OWNER' || socket.user.role === 'MANAGER') {
        const { targetUserId, message, type } = data;
        
        if (targetUserId) {
          // Send to specific user
          io.to(`user:${targetUserId}`).emit('notification', {
            message,
            type,
            from: socket.user.id,
            timestamp: new Date()
          });
        } else {
          // Broadcast to all users
          io.emit('notification', {
            message,
            type,
            from: socket.user.id,
            timestamp: new Date()
          });
        }
      }
    });

    // Handle chat messages
    socket.on('chat_message', (data) => {
      const { message, channel } = data;
      
      // Broadcast to the specified channel or general
      const room = channel || 'general';
      socket.to(room).emit('chat_message', {
        message,
        channel: room,
        user: {
          id: socket.user.id,
          name: `${socket.user.firstName} ${socket.user.lastName}`,
          role: socket.user.role
        },
        timestamp: new Date()
      });
    });

    // Handle sale completion events
    socket.on('sale_completed', (saleData) => {
      // Notify managers and owners about new sales
      io.to('role:manager').to('role:owner').emit('new_sale', {
        ...saleData,
        completedBy: socket.user.id,
        timestamp: new Date()
      });

      // Update real-time dashboard
      updateDashboard();
    });

    // Handle stock alerts
    socket.on('stock_alert', (alertData) => {
      // Send low stock alerts to managers and owners
      io.to('role:manager').to('role:owner').emit('stock_alert', {
        ...alertData,
        timestamp: new Date()
      });
    });

    // Handle disconnection
    socket.on('disconnect', () => {
      logger.info(`User disconnected: ${socket.user.email} (${socket.id})`);
      
      // Remove from connected users
      connectedUsers.delete(socket.user.id);
      
      // Remove terminal if registered
      if (socket.terminalId) {
        connectedTerminals.delete(socket.terminalId);
        socket.broadcast.to('terminals').emit('terminal_disconnected', {
          terminalId: socket.terminalId,
          user: socket.user,
          timestamp: new Date()
        });
      }
    });

    // Send initial connection success
    socket.emit('connected', {
      message: 'Connected successfully',
      user: socket.user,
      timestamp: new Date()
    });
  });

  return io;
};

// Helper functions
const sendToUser = (userId, event, data) => {
  const socketId = connectedUsers.get(userId);
  if (socketId && io) {
    io.to(`user:${userId}`).emit(event, data);
    return true;
  }
  return false;
};

const sendToRole = (role, event, data) => {
  if (io) {
    io.to(`role:${role.toLowerCase()}`).emit(event, data);
    return true;
  }
  return false;
};

const sendToTerminal = (terminalId, event, data) => {
  if (io) {
    io.to(`terminal:${terminalId}`).emit(event, data);
    return true;
  }
  return false;
};

const broadcastToAll = (event, data) => {
  if (io) {
    io.emit(event, data);
    return true;
  }
  return false;
};

const updateDashboard = async () => {
  try {
    // Get real-time statistics
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [todaySales, lowStockProducts, recentActivity] = await Promise.all([
      prisma.sale.aggregate({
        where: {
          createdAt: { gte: today }
        },
        _sum: { total: true },
        _count: true
      }),
      prisma.product.findMany({
        where: {
          currentStock: { lte: prisma.product.fields.minStock }
        },
        take: 10,
        select: {
          id: true,
          name: true,
          currentStock: true,
          minStock: true
        }
      }),
      prisma.sale.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: { firstName: true, lastName: true }
          },
          customer: {
            select: { name: true }
          }
        }
      })
    ]);

    const dashboardData = {
      todaySales: {
        total: todaySales._sum.total || 0,
        count: todaySales._count
      },
      lowStockProducts,
      recentActivity,
      timestamp: new Date()
    };

    // Send to managers and owners
    sendToRole('MANAGER', 'dashboard_update', dashboardData);
    sendToRole('OWNER', 'dashboard_update', dashboardData);
  } catch (error) {
    logger.error('Failed to update dashboard:', error);
  }
};

const getConnectedUsers = () => {
  return Array.from(connectedUsers.keys());
};

const getConnectedTerminals = () => {
  return Array.from(connectedTerminals.keys());
};

module.exports = {
  initializeSocket,
  sendToUser,
  sendToRole,
  sendToTerminal,
  broadcastToAll,
  updateDashboard,
  getConnectedUsers,
  getConnectedTerminals
};