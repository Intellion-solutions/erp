const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

/**
 * Generate PDF invoice
 * @param {Object} sale - Sale object with customer, items, and other details
 * @returns {Buffer} PDF buffer
 */
const generateInvoicePDF = async (sale) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margin: 50
      });

      const chunks = [];
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));

      // Header
      doc.fontSize(24).text('INVOICE', { align: 'center' });
      doc.moveDown();

      // Company Information
      doc.fontSize(12).text('Your Company Name', { align: 'left' });
      doc.fontSize(10).text('Your Company Address', { align: 'left' });
      doc.fontSize(10).text('Phone: Your Company Phone', { align: 'left' });
      doc.fontSize(10).text('Email: contact@yourcompany.com', { align: 'left' });
      doc.moveDown();

      // Invoice Details
      doc.fontSize(14).text('Invoice Details', { underline: true });
      doc.fontSize(10).text(`Invoice Number: ${sale.saleNumber}`);
      doc.fontSize(10).text(`Date: ${sale.createdAt.toLocaleDateString()}`);
      doc.fontSize(10).text(`Salesperson: ${sale.user.firstName} ${sale.user.lastName}`);
      doc.moveDown();

      // Customer Information
      if (sale.customer) {
        doc.fontSize(14).text('Bill To:', { underline: true });
        doc.fontSize(10).text(sale.customer.name);
        if (sale.customer.address) {
          doc.fontSize(10).text(sale.customer.address);
        }
        if (sale.customer.phone) {
          doc.fontSize(10).text(`Phone: ${sale.customer.phone}`);
        }
        if (sale.customer.email) {
          doc.fontSize(10).text(`Email: ${sale.customer.email}`);
        }
        doc.moveDown();
      }

      // Items Table
      doc.fontSize(14).text('Items', { underline: true });
      doc.moveDown();

      // Table Header
      const tableTop = doc.y;
      const itemX = 50;
      const qtyX = 200;
      const priceX = 250;
      const totalX = 350;

      doc.fontSize(10).text('Item', itemX, tableTop);
      doc.fontSize(10).text('Qty', qtyX, tableTop);
      doc.fontSize(10).text('Price', priceX, tableTop);
      doc.fontSize(10).text('Total', totalX, tableTop);
      doc.moveDown();

      // Table Content
      let currentY = doc.y;
      sale.items.forEach((item, index) => {
        doc.fontSize(10).text(item.product.name, itemX, currentY);
        doc.fontSize(10).text(item.quantity.toString(), qtyX, currentY);
        doc.fontSize(10).text(`$${item.unitPrice.toFixed(2)}`, priceX, currentY);
        doc.fontSize(10).text(`$${item.total.toFixed(2)}`, totalX, currentY);
        currentY += 20;
      });

      doc.moveDown(2);

      // Totals
      const totalsY = doc.y;
      doc.fontSize(12).text(`Subtotal: $${sale.subtotal.toFixed(2)}`, { align: 'right' });
      doc.fontSize(12).text(`Tax: $${sale.taxAmount.toFixed(2)}`, { align: 'right' });
      if (sale.discountAmount > 0) {
        doc.fontSize(12).text(`Discount: -$${sale.discountAmount.toFixed(2)}`, { align: 'right' });
      }
      doc.fontSize(14).text(`Total: $${sale.total.toFixed(2)}`, { align: 'right', underline: true });

      // Payment Information
      doc.moveDown(2);
      doc.fontSize(12).text('Payment Information', { underline: true });
      doc.fontSize(10).text(`Payment Method: ${sale.paymentMethod}`);
      doc.fontSize(10).text(`Status: ${sale.paymentStatus}`);

      // Footer
      doc.moveDown(3);
      doc.fontSize(10).text('Thank you for your business!', { align: 'center' });

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
};

/**
 * Generate receipt text for POS printing
 * @param {Object} sale - Sale object
 * @returns {string} Receipt text
 */
const generateReceiptText = (sale) => {
  let receipt = '';
  
  // Header
  receipt += '='.repeat(40) + '\n';
  receipt += 'YOUR COMPANY NAME\n';
  receipt += 'Your Company Address\n';
  receipt += 'Phone: Your Company Phone\n';
  receipt += '='.repeat(40) + '\n';
  receipt += `Receipt: ${sale.saleNumber}\n`;
  receipt += `Date: ${sale.createdAt.toLocaleDateString()}\n`;
  receipt += `Time: ${sale.createdAt.toLocaleTimeString()}\n`;
  receipt += `Cashier: ${sale.user.firstName} ${sale.user.lastName}\n`;
  receipt += '-'.repeat(40) + '\n';

  // Items
  sale.items.forEach(item => {
    receipt += `${item.product.name}\n`;
    receipt += `  ${item.quantity} x $${item.unitPrice.toFixed(2)} = $${item.total.toFixed(2)}\n`;
  });

  receipt += '-'.repeat(40) + '\n';
  receipt += `Subtotal: $${sale.subtotal.toFixed(2)}\n`;
  receipt += `Tax: $${sale.taxAmount.toFixed(2)}\n`;
  if (sale.discountAmount > 0) {
    receipt += `Discount: -$${sale.discountAmount.toFixed(2)}\n`;
  }
  receipt += `TOTAL: $${sale.total.toFixed(2)}\n`;
  receipt += '='.repeat(40) + '\n';
  receipt += 'Payment Method: ' + sale.paymentMethod + '\n';
  receipt += 'Status: ' + sale.paymentStatus + '\n';
  receipt += '='.repeat(40) + '\n';
  receipt += 'Thank you for your business!\n';
  receipt += 'Please come again!\n';
  receipt += '='.repeat(40) + '\n';

  return receipt;
};

module.exports = {
  generateInvoicePDF,
  generateReceiptText
};