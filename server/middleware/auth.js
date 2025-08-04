const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const { logger } = require('../utils/logger');

const prisma = new PrismaClient();

// Middleware to verify JWT token
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: 'Access token required' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Get user from database to ensure they still exist and are active
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

    if (!user) {
      return res.status(401).json({ error: 'Invalid token - user not found' });
    }

    if (user.status !== 'ACTIVE') {
      return res.status(401).json({ error: 'Account is not active' });
    }

    req.user = user;
    next();
  } catch (error) {
    logger.error('Authentication error:', error);
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid token' });
    }
    
    return res.status(500).json({ error: 'Authentication failed' });
  }
};

// Middleware to check user roles
const requireRole = (allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ 
        error: 'Insufficient permissions',
        requiredRoles: allowedRoles,
        userRole: req.user.role
      });
    }

    next();
  };
};

// Role-based access control shortcuts
const requireOwner = requireRole(['OWNER']);
const requireManager = requireRole(['OWNER', 'MANAGER']);
const requireSalesperson = requireRole(['OWNER', 'MANAGER', 'SALESPERSON']);

// Permission checks for specific actions
const canManageUsers = requireRole(['OWNER']);
const canManageInventory = requireRole(['OWNER', 'MANAGER']);
const canViewReports = requireRole(['OWNER', 'MANAGER']);
const canManageSettings = requireRole(['OWNER']);
const canProcessSales = requireRole(['OWNER', 'MANAGER', 'SALESPERSON']);
const canViewAuditLogs = requireRole(['OWNER']);

module.exports = {
  authenticateToken,
  requireRole,
  requireOwner,
  requireManager,
  requireSalesperson,
  canManageUsers,
  canManageInventory,
  canViewReports,
  canManageSettings,
  canProcessSales,
  canViewAuditLogs
};