class OfflineDB {
  constructor() {
    this.dbName = 'ERPOfflineDB';
    this.version = 1;
    this.db = null;
  }

  // Initialize the database
  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);

      request.onerror = () => {
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // Create object stores
        if (!db.objectStoreNames.contains('products')) {
          const productStore = db.createObjectStore('products', { keyPath: 'id' });
          productStore.createIndex('sku', 'sku', { unique: true });
          productStore.createIndex('barcode', 'barcode', { unique: false });
        }

        if (!db.objectStoreNames.contains('sales')) {
          const saleStore = db.createObjectStore('sales', { keyPath: 'id' });
          saleStore.createIndex('saleNumber', 'saleNumber', { unique: true });
          saleStore.createIndex('createdAt', 'createdAt', { unique: false });
        }

        if (!db.objectStoreNames.contains('customers')) {
          const customerStore = db.createObjectStore('customers', { keyPath: 'id' });
          customerStore.createIndex('email', 'email', { unique: true });
        }

        if (!db.objectStoreNames.contains('suppliers')) {
          const supplierStore = db.createObjectStore('suppliers', { keyPath: 'id' });
        }

        if (!db.objectStoreNames.contains('pendingOperations')) {
          const pendingStore = db.createObjectStore('pendingOperations', { keyPath: 'id', autoIncrement: true });
          pendingStore.createIndex('type', 'type', { unique: false });
          pendingStore.createIndex('timestamp', 'timestamp', { unique: false });
        }

        if (!db.objectStoreNames.contains('settings')) {
          const settingsStore = db.createObjectStore('settings', { keyPath: 'key' });
        }

        if (!db.objectStoreNames.contains('cache')) {
          const cacheStore = db.createObjectStore('cache', { keyPath: 'key' });
          cacheStore.createIndex('timestamp', 'timestamp', { unique: false });
        }
      };
    });
  }

  // Generic CRUD operations
  async add(storeName, data) {
    return this.performTransaction(storeName, 'readwrite', (store) => {
      return store.add(data);
    });
  }

  async get(storeName, key) {
    return this.performTransaction(storeName, 'readonly', (store) => {
      return store.get(key);
    });
  }

  async getAll(storeName, indexName = null, indexValue = null) {
    return this.performTransaction(storeName, 'readonly', (store) => {
      if (indexName && indexValue) {
        const index = store.index(indexName);
        return index.getAll(indexValue);
      }
      return store.getAll();
    });
  }

  async update(storeName, data) {
    return this.performTransaction(storeName, 'readwrite', (store) => {
      return store.put(data);
    });
  }

  async delete(storeName, key) {
    return this.performTransaction(storeName, 'readwrite', (store) => {
      return store.delete(key);
    });
  }

  async clear(storeName) {
    return this.performTransaction(storeName, 'readwrite', (store) => {
      return store.clear();
    });
  }

  // Perform database transaction
  async performTransaction(storeName, mode, operation) {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      const transaction = this.db.transaction([storeName], mode);
      const store = transaction.objectStore(storeName);

      const request = operation(store);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  // Offline operation management
  async addPendingOperation(operation) {
    const pendingOp = {
      type: operation.type,
      url: operation.url,
      method: operation.method,
      headers: operation.headers,
      body: operation.body,
      timestamp: Date.now()
    };

    return this.add('pendingOperations', pendingOp);
  }

  async getPendingOperations() {
    return this.getAll('pendingOperations');
  }

  async removePendingOperation(id) {
    return this.delete('pendingOperations', id);
  }

  // Cache management
  async setCache(key, data, ttl = 3600000) { // Default 1 hour TTL
    const cacheData = {
      key,
      data,
      timestamp: Date.now(),
      ttl
    };

    return this.update('cache', cacheData);
  }

  async getCache(key) {
    const cacheData = await this.get('cache', key);
    
    if (!cacheData) {
      return null;
    }

    // Check if cache is expired
    if (Date.now() - cacheData.timestamp > cacheData.ttl) {
      await this.delete('cache', key);
      return null;
    }

    return cacheData.data;
  }

  async clearExpiredCache() {
    const allCache = await this.getAll('cache');
    const now = Date.now();

    for (const cacheItem of allCache) {
      if (now - cacheItem.timestamp > cacheItem.ttl) {
        await this.delete('cache', cacheItem.key);
      }
    }
  }

  // Product-specific operations
  async getProducts() {
    return this.getAll('products');
  }

  async getProduct(id) {
    return this.get('products', id);
  }

  async getProductBySKU(sku) {
    return this.getAll('products', 'sku', sku);
  }

  async getProductByBarcode(barcode) {
    return this.getAll('products', 'barcode', barcode);
  }

  async addProduct(product) {
    return this.add('products', product);
  }

  async updateProduct(product) {
    return this.update('products', product);
  }

  async deleteProduct(id) {
    return this.delete('products', id);
  }

  // Sale-specific operations
  async getSales() {
    return this.getAll('sales');
  }

  async getSale(id) {
    return this.get('sales', id);
  }

  async addSale(sale) {
    return this.add('sales', sale);
  }

  async updateSale(sale) {
    return this.update('sales', sale);
  }

  async deleteSale(id) {
    return this.delete('sales', id);
  }

  // Customer-specific operations
  async getCustomers() {
    return this.getAll('customers');
  }

  async getCustomer(id) {
    return this.get('customers', id);
  }

  async addCustomer(customer) {
    return this.add('customers', customer);
  }

  async updateCustomer(customer) {
    return this.update('customers', customer);
  }

  async deleteCustomer(id) {
    return this.delete('customers', id);
  }

  // Supplier-specific operations
  async getSuppliers() {
    return this.getAll('suppliers');
  }

  async getSupplier(id) {
    return this.get('suppliers', id);
  }

  async addSupplier(supplier) {
    return this.add('suppliers', supplier);
  }

  async updateSupplier(supplier) {
    return this.update('suppliers', supplier);
  }

  async deleteSupplier(id) {
    return this.delete('suppliers', id);
  }

  // Settings management
  async getSetting(key) {
    const setting = await this.get('settings', key);
    return setting ? setting.value : null;
  }

  async setSetting(key, value) {
    return this.update('settings', { key, value });
  }

  async getAllSettings() {
    const settings = await this.getAll('settings');
    const result = {};
    settings.forEach(setting => {
      result[setting.key] = setting.value;
    });
    return result;
  }

  // Sync operations
  async syncWhenOnline() {
    if (!navigator.onLine) {
      return;
    }

    try {
      const pendingOperations = await this.getPendingOperations();
      
      for (const operation of pendingOperations) {
        try {
          const response = await fetch(operation.url, {
            method: operation.method,
            headers: operation.headers,
            body: operation.body
          });

          if (response.ok) {
            await this.removePendingOperation(operation.id);
            console.log('Synced operation:', operation.type);
          }
        } catch (error) {
          console.error('Failed to sync operation:', error);
        }
      }
    } catch (error) {
      console.error('Sync failed:', error);
    }
  }

  // Database maintenance
  async compact() {
    // Remove expired cache
    await this.clearExpiredCache();

    // Remove old pending operations (older than 7 days)
    const pendingOperations = await this.getPendingOperations();
    const weekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);

    for (const operation of pendingOperations) {
      if (operation.timestamp < weekAgo) {
        await this.removePendingOperation(operation.id);
      }
    }
  }

  // Export/Import data
  async exportData() {
    const data = {
      products: await this.getProducts(),
      sales: await this.getSales(),
      customers: await this.getCustomers(),
      suppliers: await this.getSuppliers(),
      settings: await this.getAllSettings(),
      timestamp: Date.now()
    };

    return data;
  }

  async importData(data) {
    // Clear existing data
    await this.clear('products');
    await this.clear('sales');
    await this.clear('customers');
    await this.clear('suppliers');
    await this.clear('settings');

    // Import new data
    if (data.products) {
      for (const product of data.products) {
        await this.addProduct(product);
      }
    }

    if (data.sales) {
      for (const sale of data.sales) {
        await this.addSale(sale);
      }
    }

    if (data.customers) {
      for (const customer of data.customers) {
        await this.addCustomer(customer);
      }
    }

    if (data.suppliers) {
      for (const supplier of data.suppliers) {
        await this.addSupplier(supplier);
      }
    }

    if (data.settings) {
      for (const [key, value] of Object.entries(data.settings)) {
        await this.setSetting(key, value);
      }
    }
  }
}

// Create singleton instance
const offlineDB = new OfflineDB();

// Initialize database when module is loaded
offlineDB.init().catch(console.error);

// Set up online/offline event listeners
window.addEventListener('online', () => {
  offlineDB.syncWhenOnline();
});

window.addEventListener('offline', () => {
  console.log('Application is offline');
});

export default offlineDB;