const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');

// Enhanced Receipt Generation Service
class ReceiptService {
  constructor() {
    this.companyInfo = {
      name: process.env.COMPANY_NAME || 'Enterprise ERP',
      address: process.env.COMPANY_ADDRESS || '123 Business St, City, State 12345',
      phone: process.env.COMPANY_PHONE || '+1 (555) 123-4567',
      email: process.env.COMPANY_EMAIL || 'info@enterprise-erp.com',
      website: process.env.COMPANY_WEBSITE || 'www.enterprise-erp.com',
      taxId: process.env.COMPANY_TAX_ID || 'TAX-123456789',
      logo: process.env.COMPANY_LOGO_PATH || null
    };
  }

  // Generate comprehensive receipt text for POS printers
  generateReceiptText(sale, options = {}) {
    const {
      showLogo = false,
      showQR = true,
      showBarcode = true,
      showTaxBreakdown = true,
      showPaymentInfo = true,
      showFooter = true,
      paperWidth = 80, // Standard thermal paper width
      fontSize = 'normal'
    } = options;

    const receipt = [];
    const divider = '─'.repeat(paperWidth);
    const centerAlign = (text) => {
      const padding = Math.max(0, Math.floor((paperWidth - text.length) / 2));
      return ' '.repeat(padding) + text;
    };

    // Header
    receipt.push(centerAlign(this.companyInfo.name.toUpperCase()));
    receipt.push(centerAlign(this.companyInfo.address));
    receipt.push(centerAlign(this.companyInfo.phone));
    receipt.push(centerAlign(this.companyInfo.email));
    receipt.push('');
    receipt.push(divider);

    // Sale Information
    receipt.push(`Receipt #: ${sale.receiptNumber || sale.id}`);
    receipt.push(`Date: ${new Date(sale.createdAt).toLocaleString()}`);
    receipt.push(`Cashier: ${sale.user?.firstName} ${sale.user?.lastName}`);
    receipt.push(`Customer: ${sale.customer?.name || 'Walk-in Customer'}`);
    receipt.push('');

    // Items
    receipt.push('ITEMS:');
    receipt.push(divider);
    receipt.push('Item'.padEnd(30) + 'Qty'.padStart(5) + 'Price'.padStart(10) + 'Total'.padStart(10));
    receipt.push(divider);

    sale.saleItems?.forEach(item => {
      const itemName = item.product?.name || 'Unknown Product';
      const truncatedName = itemName.length > 30 ? itemName.substring(0, 27) + '...' : itemName;
      const qty = item.quantity.toString().padStart(5);
      const price = parseFloat(item.unitPrice).toFixed(2).padStart(10);
      const total = parseFloat(item.total).toFixed(2).padStart(10);
      
      receipt.push(truncatedName.padEnd(30) + qty + price + total);
      
      // Show discount if any
      if (item.discount > 0) {
        const discountLine = `  Discount: -${parseFloat(item.discount).toFixed(2)}`;
        receipt.push(discountLine.padStart(55));
      }
    });

    receipt.push(divider);

    // Totals
    const subtotal = parseFloat(sale.subtotal || 0);
    const taxAmount = parseFloat(sale.taxAmount || 0);
    const discountAmount = parseFloat(sale.discountAmount || 0);
    const total = parseFloat(sale.total || 0);

    receipt.push(`Subtotal:`.padEnd(45) + subtotal.toFixed(2).padStart(10));
    
    if (discountAmount > 0) {
      receipt.push(`Discount:`.padEnd(45) + `-${discountAmount.toFixed(2)}`.padStart(10));
    }
    
    if (showTaxBreakdown && taxAmount > 0) {
      receipt.push(`Tax (${sale.taxRate || 0}%):`.padEnd(45) + taxAmount.toFixed(2).padStart(10));
    }
    
    receipt.push(divider);
    receipt.push(`TOTAL:`.padEnd(45) + total.toFixed(2).padStart(10));
    receipt.push('');

    // Payment Information
    if (showPaymentInfo && sale.payments?.length > 0) {
      receipt.push('PAYMENT:');
      receipt.push(divider);
      
      sale.payments.forEach(payment => {
        const method = payment.method?.toUpperCase() || 'CASH';
        const amount = parseFloat(payment.amount).toFixed(2);
        receipt.push(`${method}:`.padEnd(45) + amount.padStart(10));
      });
      
      const totalPaid = sale.payments.reduce((sum, p) => sum + parseFloat(p.amount), 0);
      const change = totalPaid - total;
      
      if (change > 0) {
        receipt.push(`Change:`.padEnd(45) + change.toFixed(2).padStart(10));
      }
      receipt.push('');
    }

    // QR Code and Barcode
    if (showQR) {
      receipt.push(centerAlign('Scan for digital receipt'));
      receipt.push('');
    }

    if (showBarcode) {
      receipt.push(centerAlign(`*${sale.receiptNumber || sale.id}*`));
      receipt.push('');
    }

    // Footer
    if (showFooter) {
      receipt.push(divider);
      receipt.push(centerAlign('Thank you for your purchase!'));
      receipt.push(centerAlign('Please visit us again'));
      receipt.push(centerAlign(this.companyInfo.website));
      receipt.push('');
      receipt.push(centerAlign(`Tax ID: ${this.companyInfo.taxId}`));
      receipt.push('');
      receipt.push(centerAlign('This is a computer generated receipt'));
      receipt.push(centerAlign('No signature required'));
    }

    receipt.push('');
    receipt.push('');
    receipt.push(''); // Extra spacing for paper feed

    return receipt.join('\n');
  }

  // Generate detailed PDF invoice
  async generateInvoicePDF(sale, options = {}) {
    const {
      includeLogo = true,
      includeQR = true,
      includeBarcode = true,
      showTaxBreakdown = true,
      showPaymentHistory = true,
      format = 'A4'
    } = options;

    return new Promise(async (resolve, reject) => {
      try {
        const doc = new PDFDocument({
          size: format,
          margins: {
            top: 50,
            bottom: 50,
            left: 50,
            right: 50
          }
        });

        const chunks = [];
        doc.on('data', chunk => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));

        // Header
        await this.addHeader(doc, sale, includeLogo);

        // Company and Customer Info
        this.addCompanyCustomerInfo(doc, sale);

        // Invoice Details
        this.addInvoiceDetails(doc, sale);

        // Items Table
        this.addItemsTable(doc, sale);

        // Totals
        this.addTotals(doc, sale, showTaxBreakdown);

        // Payment History
        if (showPaymentHistory && sale.payments?.length > 0) {
          this.addPaymentHistory(doc, sale);
        }

        // Terms and Conditions
        this.addTermsAndConditions(doc);

        // QR Code
        if (includeQR) {
          await this.addQRCode(doc, sale);
        }

        // Barcode
        if (includeBarcode) {
          this.addBarcode(doc, sale);
        }

        // Footer
        this.addFooter(doc);

        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  // Add header with logo and company info
  async addHeader(doc, sale, includeLogo) {
    if (includeLogo && this.companyInfo.logo && fs.existsSync(this.companyInfo.logo)) {
      try {
        doc.image(this.companyInfo.logo, 50, 50, { width: 100 });
        doc.moveDown();
      } catch (error) {
        console.warn('Could not load logo:', error.message);
      }
    }

    doc.fontSize(24)
       .font('Helvetica-Bold')
       .text(this.companyInfo.name, { align: 'center' });

    doc.fontSize(10)
       .font('Helvetica')
       .text(this.companyInfo.address, { align: 'center' })
       .text(`Phone: ${this.companyInfo.phone} | Email: ${this.companyInfo.email}`, { align: 'center' })
       .text(`Website: ${this.companyInfo.website}`, { align: 'center' });

    doc.moveDown(2);
  }

  // Add company and customer information
  addCompanyCustomerInfo(doc, sale) {
    const startY = doc.y;
    
    // Company Info (Left)
    doc.fontSize(12)
       .font('Helvetica-Bold')
       .text('From:', 50, startY);

    doc.fontSize(10)
       .font('Helvetica')
       .text(this.companyInfo.name, 50, startY + 20)
       .text(this.companyInfo.address, 50, startY + 35)
       .text(`Phone: ${this.companyInfo.phone}`, 50, startY + 50)
       .text(`Email: ${this.companyInfo.email}`, 50, startY + 65)
       .text(`Tax ID: ${this.companyInfo.taxId}`, 50, startY + 80);

    // Customer Info (Right)
    const customerName = sale.customer?.name || 'Walk-in Customer';
    const customerEmail = sale.customer?.email || '';
    const customerPhone = sale.customer?.phone || '';

    doc.fontSize(12)
       .font('Helvetica-Bold')
       .text('Bill To:', 300, startY);

    doc.fontSize(10)
       .font('Helvetica')
       .text(customerName, 300, startY + 20)
       .text(customerEmail, 300, startY + 35)
       .text(customerPhone, 300, startY + 50);

    doc.moveDown(4);
  }

  // Add invoice details
  addInvoiceDetails(doc, sale) {
    doc.fontSize(14)
       .font('Helvetica-Bold')
       .text('INVOICE', { align: 'center' });

    doc.moveDown();

    const details = [
      { label: 'Invoice Number:', value: sale.receiptNumber || sale.id },
      { label: 'Date:', value: new Date(sale.createdAt).toLocaleDateString() },
      { label: 'Due Date:', value: new Date(sale.dueDate || sale.createdAt).toLocaleDateString() },
      { label: 'Salesperson:', value: `${sale.user?.firstName} ${sale.user?.lastName}` },
      { label: 'Status:', value: sale.status?.toUpperCase() }
    ];

    let y = doc.y;
    details.forEach((detail, index) => {
      doc.fontSize(10)
         .font('Helvetica-Bold')
         .text(detail.label, 50, y + (index * 20));

      doc.fontSize(10)
         .font('Helvetica')
         .text(detail.value, 150, y + (index * 20));
    });

    doc.moveDown(2);
  }

  // Add items table
  addItemsTable(doc, sale) {
    const headers = ['Item', 'Description', 'Qty', 'Unit Price', 'Discount', 'Total'];
    const columnWidths = [80, 150, 50, 80, 60, 80];
    const startX = 50;
    let startY = doc.y;

    // Table header
    doc.fontSize(10)
       .font('Helvetica-Bold')
       .fillColor('#f0f0f0')
       .rect(startX, startY, columnWidths.reduce((a, b) => a + b, 0), 25)
       .fill();

    let x = startX;
    headers.forEach((header, index) => {
      doc.fillColor('#000000')
         .text(header, x + 5, startY + 8);
      x += columnWidths[index];
    });

    // Table rows
    startY += 25;
    sale.saleItems?.forEach((item, index) => {
      const rowY = startY + (index * 25);
      
      // Alternate row colors
      if (index % 2 === 0) {
        doc.fillColor('#fafafa')
           .rect(startX, rowY, columnWidths.reduce((a, b) => a + b, 0), 25)
           .fill();
      }

      let x = startX;
      
      // Item name
      doc.fillColor('#000000')
         .font('Helvetica')
         .text(item.product?.name || 'Unknown Product', x + 5, rowY + 8, { width: columnWidths[0] - 10 });
      x += columnWidths[0];

      // Description
      doc.text(item.product?.description || '', x + 5, rowY + 8, { width: columnWidths[1] - 10 });
      x += columnWidths[1];

      // Quantity
      doc.text(item.quantity.toString(), x + 5, rowY + 8, { width: columnWidths[2] - 10 });
      x += columnWidths[2];

      // Unit Price
      doc.text(parseFloat(item.unitPrice).toFixed(2), x + 5, rowY + 8, { width: columnWidths[3] - 10 });
      x += columnWidths[3];

      // Discount
      doc.text(parseFloat(item.discount || 0).toFixed(2), x + 5, rowY + 8, { width: columnWidths[4] - 10 });
      x += columnWidths[4];

      // Total
      doc.font('Helvetica-Bold')
         .text(parseFloat(item.total).toFixed(2), x + 5, rowY + 8, { width: columnWidths[5] - 10 });
    });

    doc.y = startY + (sale.saleItems?.length * 25) + 20;
  }

  // Add totals section
  addTotals(doc, sale, showTaxBreakdown) {
    const subtotal = parseFloat(sale.subtotal || 0);
    const taxAmount = parseFloat(sale.taxAmount || 0);
    const discountAmount = parseFloat(sale.discountAmount || 0);
    const total = parseFloat(sale.total || 0);

    const totals = [
      { label: 'Subtotal:', amount: subtotal },
      { label: 'Discount:', amount: -discountAmount },
    ];

    if (showTaxBreakdown && taxAmount > 0) {
      totals.push({ label: `Tax (${sale.taxRate || 0}%):`, amount: taxAmount });
    }

    totals.push({ label: 'TOTAL:', amount: total, bold: true });

    const startX = 400;
    let startY = doc.y;

    totals.forEach((total, index) => {
      const y = startY + (index * 20);
      
      doc.fontSize(10)
         .font(total.bold ? 'Helvetica-Bold' : 'Helvetica')
         .text(total.label, startX, y);

      doc.fontSize(10)
         .font(total.bold ? 'Helvetica-Bold' : 'Helvetica')
         .text(total.amount.toFixed(2), startX + 100, y);
    });

    doc.moveDown(2);
  }

  // Add payment history
  addPaymentHistory(doc, sale) {
    doc.fontSize(12)
       .font('Helvetica-Bold')
       .text('Payment History:', 50, doc.y);

    doc.moveDown();

    const headers = ['Date', 'Method', 'Amount', 'Reference'];
    const columnWidths = [100, 100, 100, 150];
    const startX = 50;
    let startY = doc.y;

    // Table header
    doc.fontSize(10)
       .font('Helvetica-Bold')
       .fillColor('#f0f0f0')
       .rect(startX, startY, columnWidths.reduce((a, b) => a + b, 0), 25)
       .fill();

    let x = startX;
    headers.forEach((header, index) => {
      doc.fillColor('#000000')
         .text(header, x + 5, startY + 8);
      x += columnWidths[index];
    });

    // Table rows
    startY += 25;
    sale.payments?.forEach((payment, index) => {
      const rowY = startY + (index * 25);
      
      if (index % 2 === 0) {
        doc.fillColor('#fafafa')
           .rect(startX, rowY, columnWidths.reduce((a, b) => a + b, 0), 25)
           .fill();
      }

      let x = startX;
      
      doc.fillColor('#000000')
         .font('Helvetica')
         .text(new Date(payment.createdAt).toLocaleDateString(), x + 5, rowY + 8, { width: columnWidths[0] - 10 });
      x += columnWidths[0];

      doc.text(payment.method?.toUpperCase() || 'CASH', x + 5, rowY + 8, { width: columnWidths[1] - 10 });
      x += columnWidths[1];

      doc.text(parseFloat(payment.amount).toFixed(2), x + 5, rowY + 8, { width: columnWidths[2] - 10 });
      x += columnWidths[2];

      doc.text(payment.reference || '', x + 5, rowY + 8, { width: columnWidths[3] - 10 });
    });

    doc.y = startY + (sale.payments?.length * 25) + 20;
  }

  // Add terms and conditions
  addTermsAndConditions(doc) {
    doc.fontSize(12)
       .font('Helvetica-Bold')
       .text('Terms and Conditions:', 50, doc.y);

    doc.moveDown();

    const terms = [
      '1. Payment is due within 30 days of invoice date.',
      '2. Late payments may incur additional charges.',
      '3. Returns must be made within 14 days with original receipt.',
      '4. All prices are subject to change without notice.',
      '5. This invoice is computer generated and valid without signature.'
    ];

    doc.fontSize(10)
       .font('Helvetica')
       .text(terms.join('\n'), 50, doc.y, { width: 500 });

    doc.moveDown(2);
  }

  // Add QR code
  async addQRCode(doc, sale) {
    try {
      const qrData = JSON.stringify({
        receiptNumber: sale.receiptNumber || sale.id,
        total: sale.total,
        date: sale.createdAt,
        company: this.companyInfo.name
      });

      const qrCodeBuffer = await QRCode.toBuffer(qrData, {
        width: 100,
        margin: 2
      });

      doc.image(qrCodeBuffer, 50, doc.y, { width: 100 });
      doc.text('Scan for digital receipt', 50, doc.y + 110);
    } catch (error) {
      console.warn('Could not generate QR code:', error.message);
    }
  }

  // Add barcode
  addBarcode(doc, sale) {
    const barcodeText = sale.receiptNumber || sale.id;
    
    doc.fontSize(10)
       .font('Helvetica')
       .text('Barcode:', 200, doc.y);
    
    doc.fontSize(12)
       .font('Helvetica-Bold')
       .text(`*${barcodeText}*`, 200, doc.y + 20);
  }

  // Add footer
  addFooter(doc) {
    doc.fontSize(10)
       .font('Helvetica')
       .text('Thank you for your business!', { align: 'center' })
       .text(this.companyInfo.website, { align: 'center' })
       .text(`Tax ID: ${this.companyInfo.taxId}`, { align: 'center' });
  }

  // Generate thermal printer commands
  generateThermalCommands(sale, options = {}) {
    const {
      paperWidth = 80,
      cutPaper = true,
      openDrawer = true,
      printLogo = false
    } = options;

    const commands = [];

    // Initialize printer
    commands.push('\x1B\x40'); // Initialize printer
    commands.push('\x1B\x61\x01'); // Center alignment

    // Print receipt content
    const receiptText = this.generateReceiptText(sale, { paperWidth });
    commands.push(receiptText);

    // Cut paper
    if (cutPaper) {
      commands.push('\x1D\x56\x00'); // Full cut
    }

    // Open cash drawer
    if (openDrawer) {
      commands.push('\x1B\x70\x00\x19\xFA'); // Open drawer 1
    }

    return commands.join('\n');
  }

  // Generate ESC/POS commands for different printer models
  generateESCPOSCommands(sale, printerModel = 'generic', options = {}) {
    const commands = [];

    // Initialize printer
    commands.push('\x1B\x40'); // Initialize printer

    // Set alignment and font
    commands.push('\x1B\x61\x01'); // Center alignment
    commands.push('\x1B\x21\x00'); // Normal font size

    // Print header
    commands.push(`${this.companyInfo.name.toUpperCase()}\n`);
    commands.push(`${this.companyInfo.address}\n`);
    commands.push(`${this.companyInfo.phone}\n\n`);

    // Print receipt details
    commands.push(`Receipt #: ${sale.receiptNumber || sale.id}\n`);
    commands.push(`Date: ${new Date(sale.createdAt).toLocaleString()}\n`);
    commands.push(`Cashier: ${sale.user?.firstName} ${sale.user?.lastName}\n\n`);

    // Print items
    commands.push('─'.repeat(48) + '\n');
    commands.push('Item'.padEnd(30) + 'Qty'.padStart(5) + 'Total'.padStart(13) + '\n');
    commands.push('─'.repeat(48) + '\n');

    sale.saleItems?.forEach(item => {
      const itemName = item.product?.name || 'Unknown Product';
      const truncatedName = itemName.length > 30 ? itemName.substring(0, 27) + '...' : itemName;
      const qty = item.quantity.toString().padStart(5);
      const total = parseFloat(item.total).toFixed(2).padStart(13);
      
      commands.push(truncatedName.padEnd(30) + qty + total + '\n');
    });

    commands.push('─'.repeat(48) + '\n');

    // Print totals
    const total = parseFloat(sale.total || 0);
    commands.push(`TOTAL:`.padEnd(35) + total.toFixed(2).padStart(13) + '\n\n');

    // Print footer
    commands.push('Thank you for your purchase!\n');
    commands.push('Please visit us again\n\n');

    // Cut paper
    commands.push('\x1D\x56\x00'); // Full cut

    // Open cash drawer
    commands.push('\x1B\x70\x00\x19\xFA'); // Open drawer 1

    return commands.join('');
  }
}

module.exports = new ReceiptService();