class POSHardware {
  constructor() {
    this.usbDevice = null;
    this.serialPort = null;
    this.cashDrawer = null;
    this.isConnected = false;
  }

  // ==================== WebUSB Integration ====================

  async connectUSB() {
    try {
      // Request USB device
      this.usbDevice = await navigator.usb.requestDevice({
        filters: [
          {
            vendorId: 0x0483, // STMicroelectronics
            productId: 0x5740  // Common POS printer
          },
          {
            vendorId: 0x04b8, // Epson
            productId: 0x0202  // TM-T88V
          },
          {
            vendorId: 0x0416, // Citizen
            productId: 0x0101  // CT-S310II
          }
        ]
      });

      await this.usbDevice.open();
      await this.usbDevice.selectConfiguration(1);
      await this.usbDevice.claimInterface(0);

      this.isConnected = true;
      console.log('USB device connected:', this.usbDevice.productName);
      return this.usbDevice;
    } catch (error) {
      console.error('USB connection failed:', error);
      throw error;
    }
  }

  async disconnectUSB() {
    if (this.usbDevice) {
      try {
        await this.usbDevice.close();
        this.usbDevice = null;
        this.isConnected = false;
        console.log('USB device disconnected');
      } catch (error) {
        console.error('USB disconnect error:', error);
      }
    }
  }

  async sendUSBCommand(command) {
    if (!this.usbDevice || !this.isConnected) {
      throw new Error('USB device not connected');
    }

    try {
      const encoder = new TextEncoder();
      const data = encoder.encode(command);
      
      await this.usbDevice.transferOut(1, data);
      console.log('USB command sent:', command);
    } catch (error) {
      console.error('USB command failed:', error);
      throw error;
    }
  }

  // ==================== Serial Port Integration ====================

  async connectSerial() {
    try {
      // Request serial port
      this.serialPort = await navigator.serial.requestPort({
        filters: [
          {
            usbVendorId: 0x0483,
            usbProductId: 0x5740
          },
          {
            usbVendorId: 0x04b8,
            usbProductId: 0x0202
          }
        ]
      });

      await this.serialPort.open({ baudRate: 9600 });
      this.isConnected = true;
      console.log('Serial port connected');
      return this.serialPort;
    } catch (error) {
      console.error('Serial connection failed:', error);
      throw error;
    }
  }

  async disconnectSerial() {
    if (this.serialPort) {
      try {
        await this.serialPort.close();
        this.serialPort = null;
        this.isConnected = false;
        console.log('Serial port disconnected');
      } catch (error) {
        console.error('Serial disconnect error:', error);
      }
    }
  }

  async sendSerialCommand(command) {
    if (!this.serialPort || !this.isConnected) {
      throw new Error('Serial port not connected');
    }

    try {
      const encoder = new TextEncoder();
      const data = encoder.encode(command);
      
      const writer = this.serialPort.writable.getWriter();
      await writer.write(data);
      writer.releaseLock();
      
      console.log('Serial command sent:', command);
    } catch (error) {
      console.error('Serial command failed:', error);
      throw error;
    }
  }

  // ==================== Cash Drawer Control ====================

  async openCashDrawer() {
    try {
      // ESC/POS command to open cash drawer
      const command = '\x1B\x70\x00\x19\xFA'; // ESC p 0 25 250ms
      
      if (this.usbDevice) {
        await this.sendUSBCommand(command);
      } else if (this.serialPort) {
        await this.sendSerialCommand(command);
      } else {
        throw new Error('No hardware connected');
      }

      console.log('Cash drawer opened');
      return true;
    } catch (error) {
      console.error('Failed to open cash drawer:', error);
      throw error;
    }
  }

  async closeCashDrawer() {
    try {
      // ESC/POS command to close cash drawer (if supported)
      const command = '\x1B\x70\x01\x19\xFA'; // ESC p 1 25 250ms
      
      if (this.usbDevice) {
        await this.sendUSBCommand(command);
      } else if (this.serialPort) {
        await this.sendSerialCommand(command);
      } else {
        throw new Error('No hardware connected');
      }

      console.log('Cash drawer closed');
      return true;
    } catch (error) {
      console.error('Failed to close cash drawer:', error);
      throw error;
    }
  }

  // ==================== Receipt Printing ====================

  async printReceipt(receiptData) {
    try {
      const commands = this.generateReceiptCommands(receiptData);
      
      for (const command of commands) {
        if (this.usbDevice) {
          await this.sendUSBCommand(command);
        } else if (this.serialPort) {
          await this.sendSerialCommand(command);
        } else {
          throw new Error('No hardware connected');
        }
        
        // Small delay between commands
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      console.log('Receipt printed successfully');
      return true;
    } catch (error) {
      console.error('Receipt printing failed:', error);
      throw error;
    }
  }

  generateReceiptCommands(receiptData) {
    const commands = [];
    
    // Initialize printer
    commands.push('\x1B\x40'); // ESC @ - Initialize printer
    
    // Set alignment to center
    commands.push('\x1B\x61\x01'); // ESC a 1 - Center alignment
    
    // Print header
    commands.push(`${receiptData.companyName}\n`);
    commands.push(`${receiptData.address}\n`);
    commands.push(`${receiptData.phone}\n`);
    commands.push('='.repeat(32) + '\n');
    
    // Set alignment to left
    commands.push('\x1B\x61\x00'); // ESC a 0 - Left alignment
    
    // Print receipt details
    commands.push(`Receipt: ${receiptData.receiptNumber}\n`);
    commands.push(`Date: ${receiptData.date}\n`);
    commands.push(`Time: ${receiptData.time}\n`);
    commands.push(`Cashier: ${receiptData.cashier}\n`);
    commands.push('-'.repeat(32) + '\n');
    
    // Print items
    for (const item of receiptData.items) {
      commands.push(`${item.name}\n`);
      commands.push(`  ${item.quantity} x $${item.price.toFixed(2)} = $${item.total.toFixed(2)}\n`);
    }
    
    commands.push('-'.repeat(32) + '\n');
    
    // Print totals
    commands.push(`Subtotal: $${receiptData.subtotal.toFixed(2)}\n`);
    commands.push(`Tax: $${receiptData.tax.toFixed(2)}\n`);
    if (receiptData.discount > 0) {
      commands.push(`Discount: -$${receiptData.discount.toFixed(2)}\n`);
    }
    commands.push(`TOTAL: $${receiptData.total.toFixed(2)}\n`);
    commands.push('='.repeat(32) + '\n');
    
    // Print payment info
    commands.push(`Payment Method: ${receiptData.paymentMethod}\n`);
    commands.push(`Status: ${receiptData.status}\n`);
    commands.push('='.repeat(32) + '\n');
    
    // Set alignment to center
    commands.push('\x1B\x61\x01'); // ESC a 1 - Center alignment
    
    // Print footer
    commands.push('Thank you for your business!\n');
    commands.push('Please come again!\n');
    commands.push('='.repeat(32) + '\n');
    
    // Cut paper
    commands.push('\x1D\x56\x00'); // GS V 0 - Full cut
    
    return commands;
  }

  // ==================== Barcode Scanner Integration ====================

  async setupBarcodeScanner() {
    try {
      // Request USB device for barcode scanner
      const barcodeScanner = await navigator.usb.requestDevice({
        filters: [
          {
            vendorId: 0x0483, // Common barcode scanner vendor
            productId: 0x5740
          }
        ]
      });

      await barcodeScanner.open();
      await barcodeScanner.selectConfiguration(1);
      await barcodeScanner.claimInterface(0);

      // Set up event listener for barcode data
      barcodeScanner.addEventListener('transferin', (event) => {
        const data = new TextDecoder().decode(event.data);
        this.handleBarcodeData(data);
      });

      console.log('Barcode scanner connected');
      return barcodeScanner;
    } catch (error) {
      console.error('Barcode scanner connection failed:', error);
      throw error;
    }
  }

  handleBarcodeData(data) {
    // Emit custom event for barcode data
    const event = new CustomEvent('barcodeScanned', {
      detail: { barcode: data.trim() }
    });
    window.dispatchEvent(event);
  }

  // ==================== Hardware Status ====================

  async getHardwareStatus() {
    return {
      usbConnected: !!this.usbDevice,
      serialConnected: !!this.serialPort,
      isConnected: this.isConnected,
      deviceName: this.usbDevice?.productName || this.serialPort?.getInfo()?.usbProductId || 'Unknown'
    };
  }

  async testConnection() {
    try {
      if (this.usbDevice) {
        await this.sendUSBCommand('\x1B\x40'); // Initialize printer
        return { success: true, type: 'USB' };
      } else if (this.serialPort) {
        await this.sendSerialCommand('\x1B\x40'); // Initialize printer
        return { success: true, type: 'Serial' };
      } else {
        return { success: false, error: 'No hardware connected' };
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // ==================== Utility Methods ====================

  async detectHardware() {
    const devices = [];
    
    try {
      // Try to detect USB devices
      const usbDevices = await navigator.usb.getDevices();
      devices.push(...usbDevices.map(device => ({
        type: 'USB',
        name: device.productName,
        vendorId: device.vendorId,
        productId: device.productId
      })));
    } catch (error) {
      console.log('USB detection not available');
    }

    try {
      // Try to detect serial ports
      const ports = await navigator.serial.getPorts();
      devices.push(...ports.map(port => ({
        type: 'Serial',
        name: 'Serial Port',
        info: port.getInfo()
      })));
    } catch (error) {
      console.log('Serial detection not available');
    }

    return devices;
  }

  async autoConnect() {
    try {
      // Try USB first
      const usbDevices = await navigator.usb.getDevices();
      if (usbDevices.length > 0) {
        await this.connectUSB();
        return { type: 'USB', device: usbDevices[0] };
      }

      // Try serial port
      const ports = await navigator.serial.getPorts();
      if (ports.length > 0) {
        await this.connectSerial();
        return { type: 'Serial', device: ports[0] };
      }

      throw new Error('No compatible hardware found');
    } catch (error) {
      console.error('Auto-connect failed:', error);
      throw error;
    }
  }
}

// Create singleton instance
const posHardware = new POSHardware();

export default posHardware;