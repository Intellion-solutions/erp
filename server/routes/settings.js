const express = require('express');
const { body, validationResult } = require('express-validator');
const { PrismaClient } = require('@prisma/client');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { logger } = require('../utils/logger');
const { createAuditLog } = require('../services/auditService');

const prisma = new PrismaClient();

function createSettingsRouter(io) {
  const router = express.Router();

  // Get all settings
  router.get('/', authenticateToken, async (req, res) => {
    try {
      const settings = await prisma.setting.findMany({
        orderBy: { key: 'asc' }
      });
      const settingsObject = {};
      settings.forEach(setting => {
        settingsObject[setting.key] = setting.value;
      });
      res.json(settingsObject);
    } catch (error) {
      logger.error('Error fetching settings:', error);
      res.status(500).json({ error: 'Failed to fetch settings' });
    }
  });

  // Get setting by key
  router.get('/:key', authenticateToken, async (req, res) => {
    try {
      const { key } = req.params;
      const setting = await prisma.setting.findUnique({ where: { key } });
      if (!setting) {
        return res.status(404).json({ error: 'Setting not found' });
      }
      res.json(setting);
    } catch (error) {
      logger.error('Error fetching setting:', error);
      res.status(500).json({ error: 'Failed to fetch setting' });
    }
  });

  // Create or update setting
  router.post('/', [
    authenticateToken,
    requireRole(['OWNER']),
    body('key').trim().isLength({ min: 1 }).withMessage('Key is required'),
    body('value').notEmpty().withMessage('Value is required'),
    body('description').optional().trim()
  ], async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }
      const { key, value, description } = req.body;
      const existingSetting = await prisma.setting.findUnique({ where: { key } });
      let setting;
      if (existingSetting) {
        const oldValues = existingSetting;
        setting = await prisma.setting.update({
          where: { key },
          data: { value, description }
        });
        await createAuditLog({
          userId: req.user.id,
          action: 'UPDATE',
          entity: 'Setting',
          entityId: key,
          oldValues,
          newValues: setting
        });
      } else {
        setting = await prisma.setting.create({
          data: { key, value, description }
        });
        await createAuditLog({
          userId: req.user.id,
          action: 'CREATE',
          entity: 'Setting',
          entityId: key,
          newValues: setting
        });
      }
      // Emit settings update to all clients
      if (io) io.emit('settingsUpdated', { key, value });
      res.json(setting);
    } catch (error) {
      logger.error('Error saving setting:', error);
      res.status(500).json({ error: 'Failed to save setting' });
    }
  });

  // Delete setting
  router.delete('/:key', [
    authenticateToken,
    requireRole(['OWNER'])
  ], async (req, res) => {
    try {
      const { key } = req.params;
      const setting = await prisma.setting.findUnique({ where: { key } });
      if (!setting) {
        return res.status(404).json({ error: 'Setting not found' });
      }
      await prisma.setting.delete({ where: { key } });
      await createAuditLog({
        userId: req.user.id,
        action: 'DELETE',
        entity: 'Setting',
        entityId: key,
        oldValues: setting
      });
      // Emit settings update to all clients
      if (io) io.emit('settingsUpdated', { key, deleted: true });
      res.json({ message: 'Setting deleted successfully' });
    } catch (error) {
      logger.error('Error deleting setting:', error);
      res.status(500).json({ error: 'Failed to delete setting' });
    }
  });

  // Get company information
  router.get('/company/info', authenticateToken, async (req, res) => {
    try {
      const companySettings = await prisma.setting.findMany({
        where: {
          key: {
            startsWith: 'company.'
          }
        }
      });

      const companyInfo = {};
      companySettings.forEach(setting => {
        const key = setting.key.replace('company.', '');
        companyInfo[key] = setting.value;
      });

      res.json(companyInfo);
    } catch (error) {
      logger.error('Error fetching company info:', error);
      res.status(500).json({ error: 'Failed to fetch company info' });
    }
  });

  // Update company information
  router.put('/company/info', [
    authenticateToken,
    requireRole(['OWNER']),
    body('name').optional().trim(),
    body('address').optional().trim(),
    body('phone').optional().trim(),
    body('email').optional().trim(),
    body('taxId').optional().trim(),
    body('website').optional().trim(),
    body('currency').optional().trim(),
    body('timezone').optional().trim()
  ], async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const updates = req.body;
      const updatedSettings = [];

      for (const [key, value] of Object.entries(updates)) {
        if (value !== undefined && value !== null) {
          const settingKey = `company.${key}`;
          
          const existingSetting = await prisma.setting.findUnique({
            where: { key: settingKey }
          });

          if (existingSetting) {
            const setting = await prisma.setting.update({
              where: { key: settingKey },
              data: { value }
            });
            updatedSettings.push(setting);
          } else {
            const setting = await prisma.setting.create({
              data: {
                key: settingKey,
                value,
                description: `Company ${key}`
              }
            });
            updatedSettings.push(setting);
          }
        }
      }

      res.json({ message: 'Company information updated successfully', settings: updatedSettings });
    } catch (error) {
      logger.error('Error updating company info:', error);
      res.status(500).json({ error: 'Failed to update company info' });
    }
  });

  // Get system configuration
  router.get('/system/config', authenticateToken, async (req, res) => {
    try {
      const systemSettings = await prisma.setting.findMany({
        where: {
          key: {
            startsWith: 'system.'
          }
        }
      });

      const config = {};
      systemSettings.forEach(setting => {
        const key = setting.key.replace('system.', '');
        config[key] = setting.value;
      });

      res.json(config);
    } catch (error) {
      logger.error('Error fetching system config:', error);
      res.status(500).json({ error: 'Failed to fetch system config' });
    }
  });

  // Update system configuration
  router.put('/system/config', [
    authenticateToken,
    requireRole(['OWNER']),
    body('taxRate').optional().isFloat({ min: 0, max: 100 }).withMessage('Tax rate must be between 0 and 100'),
    body('currency').optional().trim(),
    body('timezone').optional().trim(),
    body('dateFormat').optional().trim(),
    body('timeFormat').optional().trim(),
    body('language').optional().trim()
  ], async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const updates = req.body;
      const updatedSettings = [];

      for (const [key, value] of Object.entries(updates)) {
        if (value !== undefined && value !== null) {
          const settingKey = `system.${key}`;
          
          const existingSetting = await prisma.setting.findUnique({
            where: { key: settingKey }
          });

          if (existingSetting) {
            const setting = await prisma.setting.update({
              where: { key: settingKey },
              data: { value }
            });
            updatedSettings.push(setting);
          } else {
            const setting = await prisma.setting.create({
              data: {
                key: settingKey,
                value,
                description: `System ${key}`
              }
            });
            updatedSettings.push(setting);
          }
        }
      }

      res.json({ message: 'System configuration updated successfully', settings: updatedSettings });
    } catch (error) {
      logger.error('Error updating system config:', error);
      res.status(500).json({ error: 'Failed to update system config' });
    }
  });

  // Initialize default settings
  router.post('/initialize', [
    authenticateToken,
    requireRole(['OWNER'])
  ], async (req, res) => {
    try {
      const defaultSettings = [
        { key: 'company.name', value: 'Your Company Name', description: 'Company name' },
        { key: 'company.address', value: 'Your Company Address', description: 'Company address' },
        { key: 'company.phone', value: 'Your Company Phone', description: 'Company phone' },
        { key: 'company.email', value: 'contact@yourcompany.com', description: 'Company email' },
        { key: 'company.taxId', value: 'Your Tax ID', description: 'Company tax ID' },
        { key: 'company.currency', value: 'USD', description: 'Default currency' },
        { key: 'company.timezone', value: 'UTC', description: 'Default timezone' },
        { key: 'system.taxRate', value: '0', description: 'Default tax rate' },
        { key: 'system.dateFormat', value: 'YYYY-MM-DD', description: 'Date format' },
        { key: 'system.timeFormat', value: 'HH:mm', description: 'Time format' },
        { key: 'system.language', value: 'en', description: 'Default language' },
        { key: 'pos.receiptHeader', value: 'Your Company Name', description: 'POS receipt header' },
        { key: 'pos.receiptFooter', value: 'Thank you for your business!', description: 'POS receipt footer' },
        { key: 'inventory.lowStockAlert', value: 'true', description: 'Enable low stock alerts' },
        { key: 'inventory.autoReorder', value: 'false', description: 'Enable auto reorder' }
      ];

      const createdSettings = [];

      for (const setting of defaultSettings) {
        const existingSetting = await prisma.setting.findUnique({
          where: { key: setting.key }
        });

        if (!existingSetting) {
          const newSetting = await prisma.setting.create({
            data: setting
          });
          createdSettings.push(newSetting);
        }
      }

      res.json({ 
        message: 'Default settings initialized successfully', 
        created: createdSettings.length,
        settings: createdSettings 
      });
    } catch (error) {
      logger.error('Error initializing settings:', error);
      res.status(500).json({ error: 'Failed to initialize settings' });
    }
  });

  return router;
}

module.exports = createSettingsRouter;