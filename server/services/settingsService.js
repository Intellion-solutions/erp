const { PrismaClient } = require('@prisma/client');
const { logger } = require('../utils/logger');

class SettingsService {
  constructor() {
    this.prisma = new PrismaClient();
    this.cache = new Map();
    this.io = null;
    this.defaultSettings = {
      // Company Information
      'company.name': 'Enterprise ERP System',
      'company.address': '',
      'company.phone': '',
      'company.email': '',
      'company.website': '',
      'company.tax_number': '',
      
      // Invoice Settings
      'invoice.numbering.prefix': 'INV',
      'invoice.numbering.suffix': '',
      'invoice.numbering.start': '1000',
      'invoice.numbering.padding': '6',
      'invoice.currency': 'USD',
      'invoice.tax_rate': '0.00',
      'invoice.terms': 'Net 30',
      'invoice.logo_url': '',
      
      // POS Settings
      'pos.receipt.header': 'Thank you for your purchase!',
      'pos.receipt.footer': 'Please come again!',
      'pos.cash_drawer.enabled': 'true',
      'pos.barcode_scanner.enabled': 'true',
      'pos.auto_print': 'false',
      
      // Inventory Settings
      'inventory.low_stock_threshold': '10',
      'inventory.reorder_point': '5',
      'inventory.valuation_method': 'FIFO', // FIFO, LIFO, AVERAGE
      'inventory.auto_adjust': 'false',
      
      // Finance Settings
      'finance.default_currency': 'USD',
      'finance.exchange_rate_api': 'https://api.exchangerate-api.com/v4/latest/',
      'finance.approval_threshold': '1000.00',
      'finance.auto_reconciliation': 'false',
      
      // System Settings
      'system.timezone': 'UTC',
      'system.date_format': 'YYYY-MM-DD',
      'system.time_format': 'HH:mm:ss',
      'system.language': 'en',
      'system.theme': 'default',
      'system.notifications.enabled': 'true',
      'system.audit_logging': 'true',
      
      // Security Settings
      'security.session_timeout': '3600', // seconds
      'security.password_min_length': '8',
      'security.require_2fa': 'false',
      'security.login_attempts': '5',
      
      // Email/SMS Settings
      'email.smtp_host': '',
      'email.smtp_port': '587',
      'email.smtp_user': '',
      'email.smtp_pass': '',
      'email.from_address': '',
      'sms.provider': '',
      'sms.api_key': '',
      'sms.from_number': '',
      
      // Backup Settings
      'backup.auto_backup': 'true',
      'backup.frequency': 'daily',
      'backup.retention_days': '30',
      'backup.storage_path': './backups'
    };
  }

  setSocketIO(io) {
    this.io = io;
  }

  async initialize() {
    try {
      // Initialize default settings if they don't exist
      for (const [key, value] of Object.entries(this.defaultSettings)) {
        const existing = await this.prisma.setting.findUnique({
          where: { key }
        });
        
        if (!existing) {
          await this.prisma.setting.create({
            data: { key, value: value.toString() }
          });
        }
      }
      
      // Load all settings into cache
      await this.loadSettings();
      
      logger.info('Settings service initialized successfully');
    } catch (error) {
      logger.error('Error initializing settings service:', error);
    }
  }

  async loadSettings() {
    try {
      const settings = await this.prisma.setting.findMany();
      this.cache.clear();
      
      for (const setting of settings) {
        this.cache.set(setting.key, setting.value);
      }
      
      logger.info(`Loaded ${settings.length} settings into cache`);
    } catch (error) {
      logger.error('Error loading settings:', error);
    }
  }

  async get(key, defaultValue = null) {
    // Check cache first
    if (this.cache.has(key)) {
      return this.cache.get(key);
    }
    
    try {
      const setting = await this.prisma.setting.findUnique({
        where: { key }
      });
      
      if (setting) {
        this.cache.set(key, setting.value);
        return setting.value;
      }
      
      // Return default if exists
      if (this.defaultSettings[key]) {
        return this.defaultSettings[key];
      }
      
      return defaultValue;
    } catch (error) {
      logger.error(`Error getting setting ${key}:`, error);
      return defaultValue;
    }
  }

  async set(key, value, userId = null) {
    try {
      const setting = await this.prisma.setting.upsert({
        where: { key },
        update: { value: value.toString() },
        create: { key, value: value.toString() }
      });
      
      // Update cache
      this.cache.set(key, value.toString());
      
      // Emit real-time update
      if (this.io) {
        this.io.emit('settingUpdated', {
          key,
          value: value.toString(),
          updatedAt: setting.updatedAt
        });
      }
      
      // Log the change
      if (userId) {
        const { createAuditLog } = require('./auditService');
        await createAuditLog({
          userId,
          action: 'UPDATE',
          entity: 'Setting',
          entityId: key,
          newValues: { key, value: value.toString() }
        });
      }
      
      logger.info(`Setting updated: ${key} = ${value}`);
      return setting;
    } catch (error) {
      logger.error(`Error setting ${key}:`, error);
      throw error;
    }
  }

  async getMultiple(keys) {
    const result = {};
    
    for (const key of keys) {
      result[key] = await this.get(key);
    }
    
    return result;
  }

  async setMultiple(settings, userId = null) {
    const results = [];
    
    for (const [key, value] of Object.entries(settings)) {
      try {
        const result = await this.set(key, value, userId);
        results.push(result);
      } catch (error) {
        logger.error(`Error setting ${key}:`, error);
        results.push({ key, error: error.message });
      }
    }
    
    return results;
  }

  async delete(key, userId = null) {
    try {
      await this.prisma.setting.delete({
        where: { key }
      });
      
      // Remove from cache
      this.cache.delete(key);
      
      // Emit real-time update
      if (this.io) {
        this.io.emit('settingDeleted', { key });
      }
      
      // Log the change
      if (userId) {
        const { createAuditLog } = require('./auditService');
        await createAuditLog({
          userId,
          action: 'DELETE',
          entity: 'Setting',
          entityId: key,
          details: 'Setting deleted'
        });
      }
      
      logger.info(`Setting deleted: ${key}`);
      return true;
    } catch (error) {
      logger.error(`Error deleting setting ${key}:`, error);
      throw error;
    }
  }

  async getAll() {
    try {
      const settings = await this.prisma.setting.findMany({
        orderBy: { key: 'asc' }
      });
      
      // Merge with defaults for missing settings
      const result = { ...this.defaultSettings };
      
      for (const setting of settings) {
        result[setting.key] = setting.value;
      }
      
      return result;
    } catch (error) {
      logger.error('Error getting all settings:', error);
      return this.defaultSettings;
    }
  }

  async resetToDefaults(userId = null) {
    try {
      // Delete all custom settings
      await this.prisma.setting.deleteMany({});
      
      // Reload cache
      await this.loadSettings();
      
      // Emit reset event
      if (this.io) {
        this.io.emit('settingsReset', { message: 'Settings reset to defaults' });
      }
      
      // Log the reset
      if (userId) {
        const { createAuditLog } = require('./auditService');
        await createAuditLog({
          userId,
          action: 'RESET',
          entity: 'Setting',
          entityId: 'all',
          details: 'All settings reset to defaults'
        });
      }
      
      logger.info('Settings reset to defaults');
      return true;
    } catch (error) {
      logger.error('Error resetting settings:', error);
      throw error;
    }
  }

  // Helper methods for specific setting types
  async getBoolean(key, defaultValue = false) {
    const value = await this.get(key, defaultValue);
    return value === 'true' || value === true;
  }

  async getNumber(key, defaultValue = 0) {
    const value = await this.get(key, defaultValue);
    return parseFloat(value) || defaultValue;
  }

  async getJSON(key, defaultValue = {}) {
    const value = await this.get(key, defaultValue);
    try {
      return typeof value === 'string' ? JSON.parse(value) : value;
    } catch {
      return defaultValue;
    }
  }

  // Module-specific setting getters
  async getInvoiceSettings() {
    return {
      numberingPrefix: await this.get('invoice.numbering.prefix', 'INV'),
      numberingSuffix: await this.get('invoice.numbering.suffix', ''),
      numberingStart: await this.getNumber('invoice.numbering.start', 1000),
      numberingPadding: await this.getNumber('invoice.numbering.padding', 6),
      currency: await this.get('invoice.currency', 'USD'),
      taxRate: await this.getNumber('invoice.tax_rate', 0),
      terms: await this.get('invoice.terms', 'Net 30'),
      logoUrl: await this.get('invoice.logo_url', '')
    };
  }

  async getPOSSettings() {
    return {
      receiptHeader: await this.get('pos.receipt.header', 'Thank you for your purchase!'),
      receiptFooter: await this.get('pos.receipt.footer', 'Please come again!'),
      cashDrawerEnabled: await this.getBoolean('pos.cash_drawer.enabled', true),
      barcodeScannerEnabled: await this.getBoolean('pos.barcode_scanner.enabled', true),
      autoPrint: await this.getBoolean('pos.auto_print', false)
    };
  }

  async getInventorySettings() {
    return {
      lowStockThreshold: await this.getNumber('inventory.low_stock_threshold', 10),
      reorderPoint: await this.getNumber('inventory.reorder_point', 5),
      valuationMethod: await this.get('inventory.valuation_method', 'FIFO'),
      autoAdjust: await this.getBoolean('inventory.auto_adjust', false)
    };
  }

  async getFinanceSettings() {
    return {
      defaultCurrency: await this.get('finance.default_currency', 'USD'),
      exchangeRateApi: await this.get('finance.exchange_rate_api', 'https://api.exchangerate-api.com/v4/latest/'),
      approvalThreshold: await this.getNumber('finance.approval_threshold', 1000),
      autoReconciliation: await this.getBoolean('finance.auto_reconciliation', false)
    };
  }

  async getSystemSettings() {
    return {
      timezone: await this.get('system.timezone', 'UTC'),
      dateFormat: await this.get('system.date_format', 'YYYY-MM-DD'),
      timeFormat: await this.get('system.time_format', 'HH:mm:ss'),
      language: await this.get('system.language', 'en'),
      theme: await this.get('system.theme', 'default'),
      notificationsEnabled: await this.getBoolean('system.notifications.enabled', true),
      auditLogging: await this.getBoolean('system.audit_logging', true)
    };
  }
}

// Export singleton instance
const settingsService = new SettingsService();
module.exports = settingsService;