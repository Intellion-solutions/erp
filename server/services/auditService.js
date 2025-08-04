const { PrismaClient } = require('@prisma/client');
const { getDB } = require('../config/mongodb');
const { logger } = require('../utils/logger');

const prisma = new PrismaClient();

/**
 * Log an audit event to both PostgreSQL and MongoDB
 * @param {string} action - The action performed
 * @param {string} entity - The entity type (User, Product, Sale, etc.)
 * @param {string} entityId - The ID of the entity
 * @param {object} oldValues - Previous values (for updates)
 * @param {object} newValues - New values
 * @param {object} req - Express request object
 */
const auditLog = async (action, entity, entityId, oldValues = null, newValues = null, req = null) => {
  try {
    const userId = req?.user?.id || null;
    const ipAddress = req?.ip || req?.connection?.remoteAddress || null;
    const userAgent = req?.get('User-Agent') || null;

    // Log to PostgreSQL
    const auditRecord = await prisma.auditLog.create({
      data: {
        userId,
        action,
        entity,
        entityId,
        oldValues,
        newValues,
        ipAddress,
        userAgent
      }
    });

    // Also log to MongoDB for better querying and analytics
    try {
      const db = getDB();
      await db.collection('audit_logs').insertOne({
        ...auditRecord,
        timestamp: new Date(),
        metadata: {
          source: 'erp-system',
          version: '1.0.0'
        }
      });
    } catch (mongoError) {
      logger.warn('Failed to log to MongoDB:', mongoError);
      // Continue execution even if MongoDB logging fails
    }

    logger.info(`Audit log created: ${action} on ${entity} ${entityId} by user ${userId}`);
    
    return auditRecord;
  } catch (error) {
    logger.error('Audit logging failed:', error);
    // Don't throw error to avoid breaking the main operation
  }
};

/**
 * Get audit logs with filtering and pagination
 */
const getAuditLogs = async (filters = {}, page = 1, limit = 50) => {
  try {
    const skip = (page - 1) * limit;
    const where = {};

    if (filters.userId) where.userId = filters.userId;
    if (filters.action) where.action = { contains: filters.action, mode: 'insensitive' };
    if (filters.entity) where.entity = filters.entity;
    if (filters.entityId) where.entityId = filters.entityId;
    if (filters.startDate || filters.endDate) {
      where.createdAt = {};
      if (filters.startDate) where.createdAt.gte = new Date(filters.startDate);
      if (filters.endDate) where.createdAt.lte = new Date(filters.endDate);
    }

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              role: true
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit
      }),
      prisma.auditLog.count({ where })
    ]);

    return {
      logs,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit)
      }
    };
  } catch (error) {
    logger.error('Failed to fetch audit logs:', error);
    throw error;
  }
};

/**
 * Get audit statistics
 */
const getAuditStats = async (startDate, endDate) => {
  try {
    const where = {};
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    const [
      totalLogs,
      actionStats,
      entityStats,
      userStats
    ] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.groupBy({
        by: ['action'],
        where,
        _count: { action: true },
        orderBy: { _count: { action: 'desc' } }
      }),
      prisma.auditLog.groupBy({
        by: ['entity'],
        where,
        _count: { entity: true },
        orderBy: { _count: { entity: 'desc' } }
      }),
      prisma.auditLog.groupBy({
        by: ['userId'],
        where: { ...where, userId: { not: null } },
        _count: { userId: true },
        orderBy: { _count: { userId: 'desc' } },
        take: 10
      })
    ]);

    return {
      totalLogs,
      actionStats: actionStats.map(stat => ({
        action: stat.action,
        count: stat._count.action
      })),
      entityStats: entityStats.map(stat => ({
        entity: stat.entity,
        count: stat._count.entity
      })),
      userStats: userStats.map(stat => ({
        userId: stat.userId,
        count: stat._count.userId
      }))
    };
  } catch (error) {
    logger.error('Failed to fetch audit statistics:', error);
    throw error;
  }
};

module.exports = {
  auditLog,
  getAuditLogs,
  getAuditStats
};