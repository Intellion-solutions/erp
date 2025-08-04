const express = require('express');
const { body, validationResult } = require('express-validator');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { logger } = require('../utils/logger');
const settingsService = require('../services/settingsService');

function createSettingsRouter(io) {
  const router = express.Router();

  // Initialize settings service with Socket.io
  settingsService.setSocketIO(io);

  // Get all settings
  router.get('/', authenticateToken, async (req, res) => {
    try {
      const settings = await settingsService.getAll();
      res.json(settings);
    } catch (error) {
      logger.error('Error fetching settings:', error);
      res.status(500).json({ error: 'Failed to fetch settings' });
    }
  });

  // Get setting by key
  router.get('/:key', authenticateToken, async (req, res) => {
    try {
      const { key } = req.params;
      const value = await settingsService.get(key);
      
      if (value === null) {
        return res.status(404).json({ error: 'Setting not found' });
      }
      
      res.json({ key, value });
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
    body('value').notEmpty().withMessage('Value is required')
  ], async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }
      
      const { key, value } = req.body;
      const setting = await settingsService.set(key, value, req.user.id);
      res.json(setting);
    } catch (error) {
      logger.error('Error saving setting:', error);
      res.status(500).json({ error: 'Failed to save setting' });
    }
  });

  // Update multiple settings
  router.post('/batch', [
    authenticateToken,
    requireRole(['OWNER']),
    body('settings').isObject().withMessage('Settings object is required')
  ], async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }
      
      const { settings } = req.body;
      const results = await settingsService.setMultiple(settings, req.user.id);
      res.json(results);
    } catch (error) {
      logger.error('Error saving settings batch:', error);
      res.status(500).json({ error: 'Failed to save settings' });
    }
  });

  // Delete setting
  router.delete('/:key', [
    authenticateToken,
    requireRole(['OWNER'])
  ], async (req, res) => {
    try {
      const { key } = req.params;
      await settingsService.delete(key, req.user.id);
      res.json({ message: 'Setting deleted successfully' });
    } catch (error) {
      logger.error('Error deleting setting:', error);
      res.status(500).json({ error: 'Failed to delete setting' });
    }
  });

  // Reset settings to defaults
  router.post('/reset', [
    authenticateToken,
    requireRole(['OWNER'])
  ], async (req, res) => {
    try {
      await settingsService.resetToDefaults(req.user.id);
      res.json({ message: 'Settings reset to defaults successfully' });
    } catch (error) {
      logger.error('Error resetting settings:', error);
      res.status(500).json({ error: 'Failed to reset settings' });
    }
  });

  // Get module-specific settings
  router.get('/module/:module', authenticateToken, async (req, res) => {
    try {
      const { module } = req.params;
      let settings;
      
      switch (module) {
        case 'invoice':
          settings = await settingsService.getInvoiceSettings();
          break;
        case 'pos':
          settings = await settingsService.getPOSSettings();
          break;
        case 'inventory':
          settings = await settingsService.getInventorySettings();
          break;
        case 'finance':
          settings = await settingsService.getFinanceSettings();
          break;
        case 'system':
          settings = await settingsService.getSystemSettings();
          break;
        default:
          return res.status(400).json({ error: 'Invalid module' });
      }
      
      res.json(settings);
    } catch (error) {
      logger.error('Error fetching module settings:', error);
      res.status(500).json({ error: 'Failed to fetch module settings' });
    }
  });

  // Get company information
  router.get('/company/info', authenticateToken, async (req, res) => {
    try {
      const companyInfo = await settingsService.getMultiple([
        'company.name',
        'company.address',
        'company.phone',
        'company.email',
        'company.website',
        'company.tax_number'
      ]);
      
      res.json(companyInfo);
    } catch (error) {
      logger.error('Error fetching company info:', error);
      res.status(500).json({ error: 'Failed to fetch company info' });
    }
  });

  // Update company information
  router.post('/company/info', [
    authenticateToken,
    requireRole(['OWNER']),
    body('name').optional(),
    body('address').optional(),
    body('phone').optional(),
    body('email').optional(),
    body('website').optional(),
    body('tax_number').optional()
  ], async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }
      
      const settings = {};
      Object.keys(req.body).forEach(key => {
        settings[`company.${key}`] = req.body[key];
      });
      
      const results = await settingsService.setMultiple(settings, req.user.id);
      res.json(results);
    } catch (error) {
      logger.error('Error updating company info:', error);
      res.status(500).json({ error: 'Failed to update company info' });
    }
  });

  // Initialize default settings
  router.post('/initialize', [
    authenticateToken,
    requireRole(['OWNER'])
  ], async (req, res) => {
    try {
      await settingsService.initialize();
      res.json({ message: 'Settings initialized successfully' });
    } catch (error) {
      logger.error('Error initializing settings:', error);
      res.status(500).json({ error: 'Failed to initialize settings' });
    }
  });

  return router;
}

module.exports = createSettingsRouter;