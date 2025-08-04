// Enhanced POS Hardware Service
class POSHardware {
  constructor() {
    this.devices = {
      usb: null,
      serial: null,
      barcodeScanner: null,
      cashDrawer: null,
      printer: null
    };
    
    this.status = {
      connected: false,
      deviceType: null,
      lastError: null,
      isPrinting: false,
      isScanning: false
    };

    this.config = {
      autoConnect: true,
      retryAttempts: 3,
      timeout: 5000,
      paperWidth: 80,
      printQuality: 'normal',
      cashDrawerEnabled: true,
      barcodeScannerEnabled: true
    };

    this.supportedDevices = {
      printers: [
        { name: 'Epson TM-T88V', vendorId: 0x04b8, productId: 0x0202 },
        { name: 'Citizen CT-S310II', vendorId: 0x0572, productId: 0x0001 },
        { name: 'Star TSP100', vendorId: 0x0519, productId: 0x0003 },
        { name: 'Generic Thermal Printer', vendorId: null, productId: null }
      ],
      barcodeScanners: [
        { name: 'Generic Barcode Scanner', vendorId: null, productId: null }
      ],
      cashDrawers: [
        { name: 'Generic Cash Drawer', vendorId: null, productId: null }
      ]
    };

    this.eventListeners = new Map();
    this.init();
  }

  // Initialize the service
  async init() {
    try {
      // Check for WebUSB support
      if ('usb' in navigator) {
        console.log('WebUSB is supported');
        this.setupUSBListeners();
      }

      // Check for Web Serial support
      if ('serial' in navigator) {
        console.log('Web Serial is supported');
        this.setupSerialListeners();
      }

      // Setup barcode scanner
      this.setupBarcodeScanner();

      // Auto-connect if enabled
      if (this.config.autoConnect) {
        await this.autoConnect();
      }

      this.updateStatus();
    } catch (error) {
      console.error('POS Hardware initialization failed:', error);
      this.status.lastError = error.message;
    }
  }

  // Setup USB event listeners
  setupUSBListeners() {
    navigator.usb.addEventListener('connect', (event) => {
      console.log('USB device connected:', event.device);
      this.handleDeviceConnect(event.device, 'usb');
    });

    navigator.usb.addEventListener('disconnect', (event) => {
      console.log('USB device disconnected:', event.device);
      this.handleDeviceDisconnect(event.device, 'usb');
    });
  }

  // Setup Serial event listeners
  setupSerialListeners() {
    // Serial port events are handled differently
    // We'll check for port changes periodically
    setInterval(() => {
      this.checkSerialPorts();
    }, 5000);
  }

  // Handle device connection
  async handleDeviceConnect(device, type) {
    try {
      console.log(`Device connected via ${type}:`, device);
      
      // Determine device type
      const deviceType = await this.identifyDevice(device);
      
      if (deviceType) {
        this.devices[deviceType] = device;
        this.status.connected = true;
        this.status.deviceType = type;
        
        // Emit connection event
        this.emit('deviceConnected', { device, type, deviceType });
        
        console.log(`Device identified as ${deviceType} and connected`);
      }
    } catch (error) {
      console.error('Error handling device connection:', error);
      this.status.lastError = error.message;
    }
  }

  // Handle device disconnection
  handleDeviceDisconnect(device, type) {
    console.log(`Device disconnected via ${type}:`, device);
    
    // Find and remove the disconnected device
    Object.keys(this.devices).forEach(key => {
      if (this.devices[key] === device) {
        this.devices[key] = null;
      }
    });
    
    this.status.connected = Object.values(this.devices).some(device => device !== null);
    this.status.deviceType = this.status.connected ? type : null;
    
    // Emit disconnection event
    this.emit('deviceDisconnected', { device, type });
  }

  // Identify device type
  async identifyDevice(device) {
    try {
      // Check if it's a printer
      if (this.isPrinter(device)) {
        return 'printer';
      }
      
      // Check if it's a barcode scanner
      if (this.isBarcodeScanner(device)) {
        return 'barcodeScanner';
      }
      
      // Check if it's a cash drawer
      if (this.isCashDrawer(device)) {
        return 'cashDrawer';
      }
      
      return null;
    } catch (error) {
      console.error('Error identifying device:', error);
      return null;
    }
  }

  // Check if device is a printer
  isPrinter(device) {
    const printerIds = this.supportedDevices.printers.map(p => ({
      vendorId: p.vendorId,
      productId: p.productId
    }));
    
    return printerIds.some(printer => 
      (!printer.vendorId || device.vendorId === printer.vendorId) &&
      (!printer.productId || device.productId === printer.productId)
    );
  }

  // Check if device is a barcode scanner
  isBarcodeScanner(device) {
    // Barcode scanners typically have specific characteristics
    // This is a simplified check
    return device.productName?.toLowerCase().includes('scanner') ||
           device.productName?.toLowerCase().includes('barcode');
  }

  // Check if device is a cash drawer
  isCashDrawer(device) {
    // Cash drawers are typically connected via printer
    return device.productName?.toLowerCase().includes('drawer') ||
           device.productName?.toLowerCase().includes('cash');
  }

  // Auto-connect to available devices
  async autoConnect() {
    try {
      console.log('Attempting auto-connect...');
      
      // Try USB devices first
      if ('usb' in navigator) {
        const devices = await navigator.usb.getDevices();
        for (const device of devices) {
          await this.handleDeviceConnect(device, 'usb');
        }
      }
      
      // Try serial ports
      if ('serial' in navigator) {
        await this.checkSerialPorts();
      }
      
    } catch (error) {
      console.error('Auto-connect failed:', error);
      this.status.lastError = error.message;
    }
  }

  // Check available serial ports
  async checkSerialPorts() {
    try {
      const ports = await navigator.serial.getPorts();
      for (const port of ports) {
        if (!this.devices.serial) {
          await this.connectSerial(port);
        }
      }
    } catch (error) {
      console.error('Error checking serial ports:', error);
    }
  }

  // Connect to USB device
  async connectUSB(device) {
    try {
      console.log('Connecting to USB device:', device);
      
      await device.open();
      await device.selectConfiguration(1);
      await device.claimInterface(0);
      
      this.devices.usb = device;
      this.status.connected = true;
      this.status.deviceType = 'usb';
      
      this.emit('usbConnected', device);
      this.updateStatus();
      
      return true;
    } catch (error) {
      console.error('USB connection failed:', error);
      this.status.lastError = error.message;
      this.emit('connectionError', { type: 'usb', error });
      return false;
    }
  }

  // Disconnect USB device
  async disconnectUSB() {
    try {
      if (this.devices.usb) {
        await this.devices.usb.close();
        this.devices.usb = null;
        this.status.connected = false;
        this.status.deviceType = null;
        
        this.emit('usbDisconnected');
        this.updateStatus();
      }
    } catch (error) {
      console.error('USB disconnection failed:', error);
      this.status.lastError = error.message;
    }
  }

  // Connect to serial port
  async connectSerial(port) {
    try {
      console.log('Connecting to serial port:', port);
      
      await port.open({ baudRate: 9600 });
      
      this.devices.serial = port;
      this.status.connected = true;
      this.status.deviceType = 'serial';
      
      this.emit('serialConnected', port);
      this.updateStatus();
      
      return true;
    } catch (error) {
      console.error('Serial connection failed:', error);
      this.status.lastError = error.message;
      this.emit('connectionError', { type: 'serial', error });
      return false;
    }
  }

  // Disconnect serial port
  async disconnectSerial() {
    try {
      if (this.devices.serial) {
        await this.devices.serial.close();
        this.devices.serial = null;
        this.status.connected = false;
        this.status.deviceType = null;
        
        this.emit('serialDisconnected');
        this.updateStatus();
      }
    } catch (error) {
      console.error('Serial disconnection failed:', error);
      this.status.lastError = error.message;
    }
  }

  // Send command to USB device
  async sendUSBCommand(command) {
    try {
      if (!this.devices.usb) {
        throw new Error('No USB device connected');
      }
      
      const encoder = new TextEncoder();
      const data = encoder.encode(command);
      
      await this.devices.usb.transferOut(1, data);
      
      return true;
    } catch (error) {
      console.error('USB command failed:', error);
      this.status.lastError = error.message;
      return false;
    }
  }

  // Send command to serial device
  async sendSerialCommand(command) {
    try {
      if (!this.devices.serial) {
        throw new Error('No serial device connected');
      }
      
      const encoder = new TextEncoder();
      const data = encoder.encode(command);
      
      const writer = this.devices.serial.writable.getWriter();
      await writer.write(data);
      writer.releaseLock();
      
      return true;
    } catch (error) {
      console.error('Serial command failed:', error);
      this.status.lastError = error.message;
      return false;
    }
  }

  // Open cash drawer
  async openCashDrawer() {
    try {
      console.log('Opening cash drawer...');
      
      const command = '\x1B\x70\x00\x19\xFA'; // ESC p command
      
      if (this.devices.usb) {
        await this.sendUSBCommand(command);
      } else if (this.devices.serial) {
        await this.sendSerialCommand(command);
      } else {
        throw new Error('No device connected for cash drawer control');
      }
      
      this.emit('cashDrawerOpened');
      return true;
    } catch (error) {
      console.error('Failed to open cash drawer:', error);
      this.status.lastError = error.message;
      this.emit('cashDrawerError', error);
      return false;
    }
  }

  // Close cash drawer
  async closeCashDrawer() {
    try {
      console.log('Closing cash drawer...');
      
      // Most cash drawers don't have a close command
      // They close automatically when pushed
      this.emit('cashDrawerClosed');
      return true;
    } catch (error) {
      console.error('Failed to close cash drawer:', error);
      this.status.lastError = error.message;
      return false;
    }
  }

  // Print receipt
  async printReceipt(receiptData, options = {}) {
    try {
      this.status.isPrinting = true;
      this.emit('printingStarted');
      
      console.log('Printing receipt...');
      
      const {
        format = 'text',
        paperWidth = this.config.paperWidth,
        cutPaper = true,
        openDrawer = this.config.cashDrawerEnabled
      } = options;
      
      let commands = '';
      
      if (format === 'escpos') {
        commands = this.generateReceiptCommands(receiptData, {
          paperWidth,
          cutPaper,
          openDrawer
        });
      } else {
        commands = this.generateTextReceipt(receiptData, {
          paperWidth
        });
      }
      
      // Send commands to device
      if (this.devices.usb) {
        await this.sendUSBCommand(commands);
      } else if (this.devices.serial) {
        await this.sendSerialCommand(commands);
      } else {
        throw new Error('No printer device connected');
      }
      
      this.status.isPrinting = false;
      this.emit('printingCompleted');
      
      return true;
    } catch (error) {
      console.error('Printing failed:', error);
      this.status.isPrinting = false;
      this.status.lastError = error.message;
      this.emit('printingError', error);
      return false;
    }
  }

  // Generate receipt commands
  generateReceiptCommands(receiptData, options = {}) {
    const {
      paperWidth = 80,
      cutPaper = true,
      openDrawer = true
    } = options;
    
    let commands = '';
    
    // Initialize printer
    commands += '\x1B\x40'; // Initialize printer
    commands += '\x1B\x61\x01'; // Center alignment
    commands += '\x1B\x21\x00'; // Normal font size
    
    // Print header
    commands += `${receiptData.companyName.toUpperCase()}\n`;
    commands += `${receiptData.companyAddress}\n`;
    commands += `${receiptData.companyPhone}\n\n`;
    
    // Print receipt details
    commands += `Receipt #: ${receiptData.receiptNumber}\n`;
    commands += `Date: ${receiptData.date}\n`;
    commands += `Cashier: ${receiptData.cashier}\n\n`;
    
    // Print items
    commands += '─'.repeat(paperWidth - 2) + '\n';
    commands += 'Item'.padEnd(30) + 'Qty'.padStart(5) + 'Total'.padStart(13) + '\n';
    commands += '─'.repeat(paperWidth - 2) + '\n';
    
    receiptData.items.forEach(item => {
      const itemName = item.name.length > 30 ? item.name.substring(0, 27) + '...' : item.name;
      const qty = item.quantity.toString().padStart(5);
      const total = parseFloat(item.total).toFixed(2).padStart(13);
      
      commands += itemName.padEnd(30) + qty + total + '\n';
    });
    
    commands += '─'.repeat(paperWidth - 2) + '\n';
    
    // Print totals
    commands += `TOTAL:`.padEnd(35) + parseFloat(receiptData.total).toFixed(2).padStart(13) + '\n\n';
    
    // Print footer
    commands += 'Thank you for your purchase!\n';
    commands += 'Please visit us again\n\n';
    
    // Cut paper
    if (cutPaper) {
      commands += '\x1D\x56\x00'; // Full cut
    }
    
    // Open cash drawer
    if (openDrawer) {
      commands += '\x1B\x70\x00\x19\xFA'; // Open drawer 1
    }
    
    return commands;
  }

  // Generate text receipt
  generateTextReceipt(receiptData, options = {}) {
    const { paperWidth = 80 } = options;
    
    let receipt = '';
    const divider = '─'.repeat(paperWidth);
    const centerAlign = (text) => {
      const padding = Math.max(0, Math.floor((paperWidth - text.length) / 2));
      return ' '.repeat(padding) + text;
    };
    
    // Header
    receipt += centerAlign(receiptData.companyName.toUpperCase()) + '\n';
    receipt += centerAlign(receiptData.companyAddress) + '\n';
    receipt += centerAlign(receiptData.companyPhone) + '\n\n';
    receipt += divider + '\n';
    
    // Receipt details
    receipt += `Receipt #: ${receiptData.receiptNumber}\n`;
    receipt += `Date: ${receiptData.date}\n`;
    receipt += `Cashier: ${receiptData.cashier}\n\n`;
    
    // Items
    receipt += 'ITEMS:\n';
    receipt += divider + '\n';
    receipt += 'Item'.padEnd(30) + 'Qty'.padStart(5) + 'Price'.padStart(10) + 'Total'.padStart(10) + '\n';
    receipt += divider + '\n';
    
    receiptData.items.forEach(item => {
      const itemName = item.name.length > 30 ? item.name.substring(0, 27) + '...' : item.name;
      const qty = item.quantity.toString().padStart(5);
      const price = parseFloat(item.price).toFixed(2).padStart(10);
      const total = parseFloat(item.total).toFixed(2).padStart(10);
      
      receipt += itemName.padEnd(30) + qty + price + total + '\n';
    });
    
    receipt += divider + '\n';
    
    // Totals
    receipt += `Subtotal:`.padEnd(45) + parseFloat(receiptData.subtotal).toFixed(2).padStart(10) + '\n';
    if (receiptData.tax > 0) {
      receipt += `Tax:`.padEnd(45) + parseFloat(receiptData.tax).toFixed(2).padStart(10) + '\n';
    }
    receipt += divider + '\n';
    receipt += `TOTAL:`.padEnd(45) + parseFloat(receiptData.total).toFixed(2).padStart(10) + '\n\n';
    
    // Footer
    receipt += divider + '\n';
    receipt += centerAlign('Thank you for your purchase!') + '\n';
    receipt += centerAlign('Please visit us again') + '\n';
    receipt += divider + '\n';
    
    return receipt;
  }

  // Setup barcode scanner
  setupBarcodeScanner() {
    try {
      // Listen for keyboard input (barcode scanners typically act as keyboards)
      document.addEventListener('keydown', (event) => {
        this.handleBarcodeData(event);
      });
      
      console.log('Barcode scanner setup completed');
    } catch (error) {
      console.error('Barcode scanner setup failed:', error);
      this.status.lastError = error.message;
    }
  }

  // Handle barcode data
  handleBarcodeData(event) {
    // Barcode scanners typically send data as keyboard input
    // We need to accumulate the characters and detect when scanning is complete
    
    if (this.status.isScanning) {
      // Continue accumulating characters
      this.currentBarcode += event.key;
    } else {
      // Start new barcode scan
      this.status.isScanning = true;
      this.currentBarcode = event.key;
      
      // Clear the barcode after a short delay
      setTimeout(() => {
        if (this.currentBarcode) {
          this.emit('barcodeScanned', this.currentBarcode);
          this.currentBarcode = '';
        }
        this.status.isScanning = false;
      }, 100);
    }
  }

  // Get hardware status
  getHardwareStatus() {
    return {
      ...this.status,
      devices: Object.keys(this.devices).reduce((acc, key) => {
        acc[key] = this.devices[key] !== null;
        return acc;
      }, {}),
      config: this.config
    };
  }

  // Test connection
  async testConnection() {
    try {
      console.log('Testing hardware connection...');
      
      let success = false;
      
      if (this.devices.usb) {
        success = await this.sendUSBCommand('\x1B\x40'); // Initialize command
      } else if (this.devices.serial) {
        success = await this.sendSerialCommand('\x1B\x40'); // Initialize command
      }
      
      this.emit('connectionTested', { success });
      return success;
    } catch (error) {
      console.error('Connection test failed:', error);
      this.status.lastError = error.message;
      this.emit('connectionTested', { success: false, error });
      return false;
    }
  }

  // Detect hardware
  async detectHardware() {
    try {
      console.log('Detecting hardware...');
      
      const detected = {
        usb: [],
        serial: [],
        printers: [],
        scanners: [],
        cashDrawers: []
      };
      
      // Detect USB devices
      if ('usb' in navigator) {
        const devices = await navigator.usb.getDevices();
        detected.usb = devices;
        
        devices.forEach(device => {
          if (this.isPrinter(device)) {
            detected.printers.push(device);
          } else if (this.isBarcodeScanner(device)) {
            detected.scanners.push(device);
          } else if (this.isCashDrawer(device)) {
            detected.cashDrawers.push(device);
          }
        });
      }
      
      // Detect serial ports
      if ('serial' in navigator) {
        const ports = await navigator.serial.getPorts();
        detected.serial = ports;
      }
      
      this.emit('hardwareDetected', detected);
      return detected;
    } catch (error) {
      console.error('Hardware detection failed:', error);
      this.status.lastError = error.message;
      return null;
    }
  }

  // Update status
  updateStatus() {
    this.status.connected = Object.values(this.devices).some(device => device !== null);
    this.emit('statusUpdated', this.getHardwareStatus());
  }

  // Event handling
  on(event, callback) {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event).push(callback);
  }

  off(event, callback) {
    if (this.eventListeners.has(event)) {
      const listeners = this.eventListeners.get(event);
      const index = listeners.indexOf(callback);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    }
  }

  emit(event, data) {
    if (this.eventListeners.has(event)) {
      this.eventListeners.get(event).forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`Error in event listener for ${event}:`, error);
        }
      });
    }
  }

  // Configuration methods
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    this.emit('configUpdated', this.config);
  }

  getConfig() {
    return { ...this.config };
  }

  // Cleanup
  destroy() {
    try {
      // Disconnect all devices
      this.disconnectUSB();
      this.disconnectSerial();
      
      // Remove event listeners
      this.eventListeners.clear();
      
      console.log('POS Hardware service destroyed');
    } catch (error) {
      console.error('Error destroying POS Hardware service:', error);
    }
  }
}

// Create singleton instance
const posHardware = new POSHardware();

export default posHardware;