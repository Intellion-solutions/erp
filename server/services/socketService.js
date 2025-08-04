const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const logger = require('../utils/logger');

const prisma = new PrismaClient();
let io;

// Active connections tracking
const activeConnections = new Map();
const activeTerminals = new Map();
const roomSubscriptions = new Map();

// Initialize Socket.IO
const initSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: process.env.CLIENT_URL || "http://localhost:3000",
      credentials: true
    },
    pingTimeout: 60000,
    pingInterval: 25000
  });

  // Authentication middleware
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      if (!token) {
        return next(new Error('Authentication error'));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await prisma.user.findUnique({
        where: { id: decoded.userId }
      });

      if (!user) {
        return next(new Error('User not found'));
      }

      socket.userId = user.id;
      socket.userRole = user.role;
      socket.userData = user;
      next();
    } catch (error) {
      logger.error('Socket authentication error:', error);
      next(new Error('Authentication failed'));
    }
  });

  io.on('connection', (socket) => {
    handleConnection(socket);
  });

  // Cleanup interval for inactive connections
  setInterval(cleanupInactiveConnections, 30000);

  logger.info('Socket.IO server initialized');
  return io;
};

// Handle new connection
const handleConnection = (socket) => {
  const { userId, userRole, userData } = socket;
  
  logger.info(`User connected: ${userData.email} (${userRole})`);

  // Store active connection
  activeConnections.set(socket.id, {
    userId,
    userRole,
    userData,
    connectedAt: new Date(),
    lastActivity: new Date()
  });

  // Join user to role-based rooms
  socket.join(`role:${userRole.toLowerCase()}`);
  socket.join(`user:${userId}`);

  // Send connection confirmation
  socket.emit('connected', {
    message: 'Connected successfully',
    user: userData,
    serverTime: new Date().toISOString()
  });

  // Broadcast user online status to admins
  broadcastToRole('OWNER', 'user_status', {
    userId,
    status: 'online',
    user: userData
  });

  // Event handlers
  setupEventHandlers(socket);

  // Handle disconnection
  socket.on('disconnect', (reason) => {
    handleDisconnection(socket, reason);
  });

  // Update last activity
  socket.on('ping', () => {
    updateLastActivity(socket.id);
    socket.emit('pong');
  });
};

// Setup event handlers for different socket events
const setupEventHandlers = (socket) => {
  const { userId, userRole } = socket;

  // Terminal registration for POS
  socket.on('register_terminal', (terminalData) => {
    handleTerminalRegistration(socket, terminalData);
  });

  // POS Events
  socket.on('pos_session_start', (sessionData) => {
    handlePOSSessionStart(socket, sessionData);
  });

  socket.on('pos_item_scan', (scanData) => {
    handlePOSItemScan(socket, scanData);
  });

  socket.on('pos_cart_update', (cartData) => {
    handlePOSCartUpdate(socket, cartData);
  });

  // Inventory Events
  socket.on('inventory_check', (productId) => {
    handleInventoryCheck(socket, productId);
  });

  socket.on('stock_adjustment', (adjustmentData) => {
    handleStockAdjustment(socket, adjustmentData);
  });

  // Dashboard Events
  socket.on('subscribe_dashboard', (dashboardType) => {
    handleDashboardSubscription(socket, dashboardType);
  });

  socket.on('request_live_stats', () => {
    handleLiveStatsRequest(socket);
  });

  // Notification Events
  socket.on('mark_notification_read', (notificationId) => {
    handleNotificationRead(socket, notificationId);
  });

  // Chat/Support Events
  socket.on('join_support_room', (roomId) => {
    handleSupportRoomJoin(socket, roomId);
  });

  socket.on('support_message', (messageData) => {
    handleSupportMessage(socket, messageData);
  });

  // Analytics Events
  socket.on('request_realtime_analytics', (params) => {
    handleRealtimeAnalytics(socket, params);
  });
};

// Terminal registration for POS systems
const handleTerminalRegistration = (socket, terminalData) => {
  const terminalId = terminalData.terminalId || `terminal_${socket.id}`;
  
  activeTerminals.set(terminalId, {
    socketId: socket.id,
    userId: socket.userId,
    location: terminalData.location || 'Unknown',
    capabilities: terminalData.capabilities || [],
    registeredAt: new Date()
  });

  socket.terminalId = terminalId;
  socket.join(`terminal:${terminalId}`);
  socket.join('terminals');

  socket.emit('terminal_registered', {
    terminalId,
    status: 'active',
    connectedTerminals: activeTerminals.size
  });

  // Notify managers about new terminal
  broadcastToRole('MANAGER', 'terminal_online', {
    terminalId,
    location: terminalData.location,
    user: socket.userData
  });

  logger.info(`Terminal registered: ${terminalId} by ${socket.userData.email}`);
};

// POS Session Management
const handlePOSSessionStart = (socket, sessionData) => {
  const sessionId = `session_${Date.now()}_${socket.userId}`;
  
  socket.join(`pos_session:${sessionId}`);
  
  // Broadcast to other terminals and managers
  socket.to('terminals').emit('pos_session_started', {
    sessionId,
    terminalId: socket.terminalId,
    user: socket.userData,
    timestamp: new Date().toISOString()
  });

  broadcastToRole('MANAGER', 'pos_activity', {
    type: 'session_start',
    sessionId,
    terminalId: socket.terminalId,
    user: socket.userData
  });

  socket.emit('pos_session_created', { sessionId });
};

// Handle barcode/item scanning
const handlePOSItemScan = (socket, scanData) => {
  const { barcode, sessionId } = scanData;
  
  // Broadcast scan to other terminals in session
  if (sessionId) {
    socket.to(`pos_session:${sessionId}`).emit('item_scanned', {
      barcode,
      scannedBy: socket.userData,
      timestamp: new Date().toISOString()
    });
  }

  // Real-time inventory check
  emitToUser(socket.userId, 'scan_result', {
    barcode,
    timestamp: new Date().toISOString()
  });
};

// Handle cart updates
const handlePOSCartUpdate = (socket, cartData) => {
  const { sessionId, cart, action } = cartData;

  // Broadcast to session participants
  if (sessionId) {
    socket.to(`pos_session:${sessionId}`).emit('cart_updated', {
      cart,
      action,
      updatedBy: socket.userData,
      timestamp: new Date().toISOString()
    });
  }

  // Real-time dashboard updates
  broadcastToRole('MANAGER', 'live_cart_update', {
    terminalId: socket.terminalId,
    cartTotal: cart.total,
    itemCount: cart.items?.length || 0,
    timestamp: new Date().toISOString()
  });
};

// Inventory check
const handleInventoryCheck = async (socket, productId) => {
  try {
    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: { category: true }
    });

    socket.emit('inventory_status', {
      product,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    socket.emit('error', { message: 'Failed to check inventory' });
  }
};

// Stock adjustment handling
const handleStockAdjustment = (socket, adjustmentData) => {
  const { productId, adjustment, reason } = adjustmentData;

  // Broadcast to all relevant users
  broadcastToRole('MANAGER', 'stock_adjusted', {
    productId,
    adjustment,
    reason,
    adjustedBy: socket.userData,
    timestamp: new Date().toISOString()
  });

  // Notify terminals
  io.to('terminals').emit('inventory_updated', {
    productId,
    adjustment,
    timestamp: new Date().toISOString()
  });
};

// Dashboard subscription
const handleDashboardSubscription = (socket, dashboardType) => {
  const roomName = `dashboard:${dashboardType}`;
  socket.join(roomName);

  if (!roomSubscriptions.has(roomName)) {
    roomSubscriptions.set(roomName, new Set());
  }
  roomSubscriptions.get(roomName).add(socket.id);

  // Send initial dashboard data
  sendDashboardData(socket, dashboardType);
};

// Live stats request
const handleLiveStatsRequest = async (socket) => {
  try {
    // Get real-time stats
    const stats = await getLiveStats();
    socket.emit('live_stats', stats);
  } catch (error) {
    socket.emit('error', { message: 'Failed to get live stats' });
  }
};

// Notification management
const handleNotificationRead = async (socket, notificationId) => {
  try {
    // Mark notification as read in database
    await prisma.notification.update({
      where: { id: notificationId },
      data: { readAt: new Date() }
    });

    socket.emit('notification_marked_read', { notificationId });
  } catch (error) {
    socket.emit('error', { message: 'Failed to mark notification as read' });
  }
};

// Support chat
const handleSupportRoomJoin = (socket, roomId) => {
  socket.join(`support:${roomId}`);
  socket.emit('support_room_joined', { roomId });
};

const handleSupportMessage = (socket, messageData) => {
  const { roomId, message } = messageData;
  
  const messageWithMeta = {
    ...message,
    from: socket.userData,
    timestamp: new Date().toISOString()
  };

  socket.to(`support:${roomId}`).emit('support_message', messageWithMeta);
};

// Real-time analytics
const handleRealtimeAnalytics = async (socket, params) => {
  try {
    const analytics = await getRealtimeAnalytics(params);
    socket.emit('realtime_analytics', analytics);
  } catch (error) {
    socket.emit('error', { message: 'Failed to get analytics' });
  }
};

// Handle disconnection
const handleDisconnection = (socket, reason) => {
  const connection = activeConnections.get(socket.id);
  if (connection) {
    logger.info(`User disconnected: ${connection.userData.email} (${reason})`);

    // Remove from active connections
    activeConnections.delete(socket.id);

    // Remove terminal if registered
    if (socket.terminalId) {
      activeTerminals.delete(socket.terminalId);
      broadcastToRole('MANAGER', 'terminal_offline', {
        terminalId: socket.terminalId,
        user: connection.userData
      });
    }

    // Notify about user offline status
    broadcastToRole('OWNER', 'user_status', {
      userId: connection.userId,
      status: 'offline',
      user: connection.userData
    });

    // Clean up room subscriptions
    for (const [roomName, subscribers] of roomSubscriptions.entries()) {
      subscribers.delete(socket.id);
      if (subscribers.size === 0) {
        roomSubscriptions.delete(roomName);
      }
    }
  }
};

// Utility Functions

// Broadcast to specific role
const broadcastToRole = (role, event, data) => {
  if (io) {
    io.to(`role:${role.toLowerCase()}`).emit(event, data);
  }
};

// Emit to specific user
const emitToUser = (userId, event, data) => {
  if (io) {
    io.to(`user:${userId}`).emit(event, data);
  }
};

// Emit to all terminals
const emitToAllTerminals = (event, data) => {
  if (io) {
    io.to('terminals').emit(event, data);
  }
};

// Emit to dashboard subscribers
const emitToDashboard = (dashboardType, event, data) => {
  if (io) {
    io.to(`dashboard:${dashboardType}`).emit(event, data);
  }
};

// Send sale completion notification
const notifySaleCompleted = (saleData) => {
  if (io) {
    // Notify all terminals
    emitToAllTerminals('sale_completed', {
      saleId: saleData.id,
      total: saleData.total,
      items: saleData.items?.length || 0,
      timestamp: new Date().toISOString()
    });

    // Notify managers and owners
    broadcastToRole('MANAGER', 'new_sale', saleData);
    broadcastToRole('OWNER', 'new_sale', saleData);

    // Update dashboard
    emitToDashboard('admin', 'dashboard_update', {
      type: 'sale',
      data: saleData
    });
  }
};

// Send inventory update notification
const notifyInventoryUpdate = (productData, updateType = 'stock_change') => {
  if (io) {
    const updateData = {
      product: productData,
      updateType,
      timestamp: new Date().toISOString()
    };

    // Notify all terminals
    emitToAllTerminals('inventory_updated', updateData);

    // Notify managers
    broadcastToRole('MANAGER', 'inventory_change', updateData);

    // Check for low stock alerts
    if (productData.currentStock <= productData.minStock) {
      const alertData = {
        product: productData,
        currentStock: productData.currentStock,
        minStock: productData.minStock,
        severity: productData.currentStock === 0 ? 'critical' : 'warning'
      };

      broadcastToRole('MANAGER', 'stock_alert', alertData);
      broadcastToRole('OWNER', 'stock_alert', alertData);
    }
  }
};

// Send system notification
const sendSystemNotification = (notification) => {
  if (io) {
    const { targetRole, targetUser, type, title, message, data } = notification;

    const notificationData = {
      id: notification.id || Date.now().toString(),
      type,
      title,
      message,
      data,
      timestamp: new Date().toISOString()
    };

    if (targetUser) {
      emitToUser(targetUser, 'notification', notificationData);
    } else if (targetRole) {
      broadcastToRole(targetRole, 'notification', notificationData);
    } else {
      io.emit('notification', notificationData);
    }
  }
};

// Get live statistics
const getLiveStats = async () => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [todaySales, activeProducts, activeUsers, recentOrders] = await Promise.all([
      prisma.sale.aggregate({
        where: {
          createdAt: { gte: today }
        },
        _sum: { total: true },
        _count: true
      }),
      prisma.product.count({
        where: { status: 'ACTIVE' }
      }),
      prisma.user.count({
        where: { status: 'ACTIVE' }
      }),
      prisma.sale.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { firstName: true, lastName: true } },
          items: { include: { product: { select: { name: true } } } }
        }
      })
    ]);

    return {
      todayRevenue: todaySales._sum.total || 0,
      todayOrders: todaySales._count || 0,
      activeProducts,
      activeUsers,
      activeTerminals: activeTerminals.size,
      activeConnections: activeConnections.size,
      recentOrders: recentOrders.map(order => ({
        id: order.id,
        total: order.total,
        items: order.items.length,
        user: `${order.user.firstName} ${order.user.lastName}`,
        createdAt: order.createdAt
      }))
    };
  } catch (error) {
    logger.error('Failed to get live stats:', error);
    return {};
  }
};

// Get real-time analytics
const getRealtimeAnalytics = async (params) => {
  try {
    const { timeframe = '24h', type = 'sales' } = params;
    
    let startDate = new Date();
    if (timeframe === '24h') {
      startDate.setHours(startDate.getHours() - 24);
    } else if (timeframe === '7d') {
      startDate.setDate(startDate.getDate() - 7);
    }

    if (type === 'sales') {
      const sales = await prisma.sale.findMany({
        where: {
          createdAt: { gte: startDate }
        },
        select: {
          total: true,
          createdAt: true,
          paymentMethod: true
        }
      });

      return {
        totalRevenue: sales.reduce((sum, sale) => sum + sale.total, 0),
        totalOrders: sales.length,
        averageOrder: sales.length > 0 ? sales.reduce((sum, sale) => sum + sale.total, 0) / sales.length : 0,
        hourlyData: groupSalesByHour(sales),
        paymentMethods: groupSalesByPayment(sales)
      };
    }

    return {};
  } catch (error) {
    logger.error('Failed to get realtime analytics:', error);
    return {};
  }
};

// Helper functions
const groupSalesByHour = (sales) => {
  const hourly = {};
  sales.forEach(sale => {
    const hour = sale.createdAt.getHours();
    if (!hourly[hour]) {
      hourly[hour] = { revenue: 0, orders: 0 };
    }
    hourly[hour].revenue += sale.total;
    hourly[hour].orders += 1;
  });
  return hourly;
};

const groupSalesByPayment = (sales) => {
  const methods = {};
  sales.forEach(sale => {
    const method = sale.paymentMethod;
    if (!methods[method]) {
      methods[method] = { count: 0, total: 0 };
    }
    methods[method].count += 1;
    methods[method].total += sale.total;
  });
  return methods;
};

// Send dashboard data
const sendDashboardData = async (socket, dashboardType) => {
  try {
    const stats = await getLiveStats();
    socket.emit('dashboard_data', {
      type: dashboardType,
      data: stats,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    socket.emit('error', { message: 'Failed to get dashboard data' });
  }
};

// Update last activity
const updateLastActivity = (socketId) => {
  const connection = activeConnections.get(socketId);
  if (connection) {
    connection.lastActivity = new Date();
  }
};

// Cleanup inactive connections
const cleanupInactiveConnections = () => {
  const now = new Date();
  const timeout = 5 * 60 * 1000; // 5 minutes

  for (const [socketId, connection] of activeConnections.entries()) {
    if (now - connection.lastActivity > timeout) {
      const socket = io.sockets.sockets.get(socketId);
      if (socket) {
        socket.disconnect(true);
      }
      activeConnections.delete(socketId);
      logger.info(`Cleaned up inactive connection: ${connection.userData.email}`);
    }
  }
};

// Get socket instance
const getSocket = () => io;

// Get active connections info
const getActiveConnections = () => ({
  total: activeConnections.size,
  terminals: activeTerminals.size,
  connections: Array.from(activeConnections.values()).map(conn => ({
    userId: conn.userId,
    role: conn.userRole,
    email: conn.userData.email,
    connectedAt: conn.connectedAt,
    lastActivity: conn.lastActivity
  }))
});

module.exports = {
  initSocket,
  getSocket,
  broadcastToRole,
  emitToUser,
  emitToAllTerminals,
  emitToDashboard,
  notifySaleCompleted,
  notifyInventoryUpdate,
  sendSystemNotification,
  getActiveConnections
};