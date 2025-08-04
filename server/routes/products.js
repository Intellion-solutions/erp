const express = require('express');
const { body, validationResult, query } = require('express-validator');
const { PrismaClient } = require('@prisma/client');
const multer = require('multer');
const path = require('path');
const sharp = require('sharp');
const fs = require('fs').promises;

const { logger } = require('../utils/logger');
const { authenticateToken, canManageInventory, canProcessSales } = require('../middleware/auth');
const { auditLog } = require('../services/auditService');
const { sendToRole } = require('../services/socketService');

const router = express.Router();
const prisma = new PrismaClient();

// Configure multer for image uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadPath = path.join(__dirname, '../../uploads/products');
    try {
      await fs.mkdir(uploadPath, { recursive: true });
      cb(null, uploadPath);
    } catch (error) {
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    const uniqueName = `product-${Date.now()}-${Math.random().toString(36).substr(2, 9)}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024 // 10MB
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

// Get all products with filtering and pagination
router.get('/', [
  authenticateToken,
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('status').optional().isIn(['ACTIVE', 'INACTIVE', 'DISCONTINUED'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const where = {};
    
    if (req.query.search) {
      where.OR = [
        { name: { contains: req.query.search, mode: 'insensitive' } },
        { sku: { contains: req.query.search, mode: 'insensitive' } },
        { barcode: { contains: req.query.search, mode: 'insensitive' } }
      ];
    }

    if (req.query.category) {
      where.categoryId = req.query.category;
    }

    if (req.query.supplier) {
      where.supplierId = req.query.supplier;
    }

    if (req.query.status) {
      where.status = req.query.status;
    }

    if (req.query.lowStock === 'true') {
      where.currentStock = { lte: prisma.product.fields.minStock };
    }

    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where,
        include: {
          category: {
            select: { id: true, name: true }
          },
          supplier: {
            select: { id: true, name: true }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit
      }),
      prisma.product.count({ where })
    ]);

    res.json({
      products,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    logger.error('Products fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

// Get single product
router.get('/:id', [authenticateToken], async (req, res) => {
  try {
    const { id } = req.params;

    const product = await prisma.product.findUnique({
      where: { id },
      include: {
        category: {
          select: { id: true, name: true }
        },
        supplier: {
          select: { id: true, name: true, email: true, phone: true }
        },
        stockMovements: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: {
            id: true,
            type: true,
            quantity: true,
            reference: true,
            notes: true,
            createdAt: true
          }
        }
      }
    });

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    res.json({ product });
  } catch (error) {
    logger.error('Product fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch product' });
  }
});

// Create new product
router.post('/', [
  authenticateToken,
  canManageInventory,
  upload.single('image'),
  body('name').trim().isLength({ min: 1 }),
  body('sku').trim().isLength({ min: 1 }),
  body('price').isFloat({ min: 0 }),
  body('cost').isFloat({ min: 0 }),
  body('categoryId').notEmpty(),
  body('minStock').optional().isInt({ min: 0 }),
  body('maxStock').optional().isInt({ min: 0 }),
  body('currentStock').optional().isInt({ min: 0 }),
  body('taxRate').optional().isFloat({ min: 0, max: 100 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      name, description, sku, barcode, rfidTag, price, cost,
      categoryId, supplierId, minStock = 0, maxStock, currentStock = 0,
      unit = 'piece', taxRate = 0
    } = req.body;

    // Check if SKU or barcode already exists
    const existingProduct = await prisma.product.findFirst({
      where: {
        OR: [
          { sku },
          ...(barcode ? [{ barcode }] : []),
          ...(rfidTag ? [{ rfidTag }] : [])
        ]
      }
    });

    if (existingProduct) {
      return res.status(400).json({ 
        error: 'Product with this SKU, barcode, or RFID tag already exists' 
      });
    }

    let imagePath = null;
    if (req.file) {
      // Process and optimize image
      const optimizedPath = path.join(
        path.dirname(req.file.path),
        `optimized-${req.file.filename}`
      );

      await sharp(req.file.path)
        .resize(800, 600, { 
          fit: 'inside',
          withoutEnlargement: true
        })
        .jpeg({ quality: 85 })
        .toFile(optimizedPath);

      // Remove original file
      await fs.unlink(req.file.path);
      
      imagePath = `/uploads/products/optimized-${req.file.filename}`;
    }

    const product = await prisma.product.create({
      data: {
        name,
        description,
        sku,
        barcode,
        rfidTag,
        price,
        cost,
        categoryId,
        supplierId,
        minStock,
        maxStock,
        currentStock,
        unit,
        taxRate,
        image: imagePath
      },
      include: {
        category: {
          select: { id: true, name: true }
        },
        supplier: {
          select: { id: true, name: true }
        }
      }
    });

    // Create initial stock movement if currentStock > 0
    if (currentStock > 0) {
      await prisma.stockMovement.create({
        data: {
          productId: product.id,
          type: 'ADJUSTMENT',
          quantity: currentStock,
          reference: 'INITIAL_STOCK',
          notes: `Initial stock set by ${req.user.firstName} ${req.user.lastName}`
        }
      });
    }

    // Log the creation
    await auditLog('PRODUCT_CREATE', 'Product', product.id, null, product, req);

    // Notify managers and owners
    sendToRole('MANAGER', 'product_created', {
      product,
      createdBy: req.user.id
    });
    sendToRole('OWNER', 'product_created', {
      product,
      createdBy: req.user.id
    });

    logger.info(`Product created: ${product.name} (${product.sku}) by ${req.user.email}`);

    res.status(201).json({
      message: 'Product created successfully',
      product
    });
  } catch (error) {
    logger.error('Product creation error:', error);
    
    // Clean up uploaded file if error occurs
    if (req.file) {
      try {
        await fs.unlink(req.file.path);
      } catch (unlinkError) {
        logger.error('Failed to clean up uploaded file:', unlinkError);
      }
    }
    
    res.status(500).json({ error: 'Failed to create product' });
  }
});

// Update product
router.put('/:id', [
  authenticateToken,
  canManageInventory,
  upload.single('image'),
  body('name').optional().trim().isLength({ min: 1 }),
  body('price').optional().isFloat({ min: 0 }),
  body('cost').optional().isFloat({ min: 0 }),
  body('minStock').optional().isInt({ min: 0 }),
  body('maxStock').optional().isInt({ min: 0 }),
  body('taxRate').optional().isFloat({ min: 0, max: 100 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const updateData = { ...req.body };

    // Get current product
    const currentProduct = await prisma.product.findUnique({
      where: { id }
    });

    if (!currentProduct) {
      return res.status(404).json({ error: 'Product not found' });
    }

    // Handle image upload
    if (req.file) {
      // Process and optimize new image
      const optimizedPath = path.join(
        path.dirname(req.file.path),
        `optimized-${req.file.filename}`
      );

      await sharp(req.file.path)
        .resize(800, 600, { 
          fit: 'inside',
          withoutEnlargement: true
        })
        .jpeg({ quality: 85 })
        .toFile(optimizedPath);

      // Remove original uploaded file
      await fs.unlink(req.file.path);

      // Remove old image if exists
      if (currentProduct.image) {
        try {
          const oldImagePath = path.join(__dirname, '../../', currentProduct.image);
          await fs.unlink(oldImagePath);
        } catch (error) {
          logger.warn('Failed to remove old image:', error);
        }
      }

      updateData.image = `/uploads/products/optimized-${req.file.filename}`;
    }

    // Check for SKU/barcode conflicts
    if (updateData.sku || updateData.barcode || updateData.rfidTag) {
      const conflictWhere = {
        AND: [
          { id: { not: id } },
          {
            OR: []
          }
        ]
      };

      if (updateData.sku) conflictWhere.AND[1].OR.push({ sku: updateData.sku });
      if (updateData.barcode) conflictWhere.AND[1].OR.push({ barcode: updateData.barcode });
      if (updateData.rfidTag) conflictWhere.AND[1].OR.push({ rfidTag: updateData.rfidTag });

      const existingProduct = await prisma.product.findFirst({
        where: conflictWhere
      });

      if (existingProduct) {
        return res.status(400).json({ 
          error: 'Another product with this SKU, barcode, or RFID tag already exists' 
        });
      }
    }

    const updatedProduct = await prisma.product.update({
      where: { id },
      data: updateData,
      include: {
        category: {
          select: { id: true, name: true }
        },
        supplier: {
          select: { id: true, name: true }
        }
      }
    });

    // Log the update
    await auditLog('PRODUCT_UPDATE', 'Product', id, currentProduct, updatedProduct, req);

    // Notify about inventory changes
    sendToRole('MANAGER', 'product_updated', {
      product: updatedProduct,
      updatedBy: req.user.id
    });
    sendToRole('OWNER', 'product_updated', {
      product: updatedProduct,
      updatedBy: req.user.id
    });

    logger.info(`Product updated: ${updatedProduct.name} (${updatedProduct.sku}) by ${req.user.email}`);

    res.json({
      message: 'Product updated successfully',
      product: updatedProduct
    });
  } catch (error) {
    logger.error('Product update error:', error);
    
    // Clean up uploaded file if error occurs
    if (req.file) {
      try {
        await fs.unlink(req.file.path);
      } catch (unlinkError) {
        logger.error('Failed to clean up uploaded file:', unlinkError);
      }
    }
    
    res.status(500).json({ error: 'Failed to update product' });
  }
});

// Adjust stock
router.post('/:id/stock/adjust', [
  authenticateToken,
  canManageInventory,
  body('quantity').isInt(),
  body('type').isIn(['ADJUSTMENT', 'RETURN', 'TRANSFER']),
  body('reference').optional(),
  body('notes').optional()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const { quantity, type, reference, notes } = req.body;

    const product = await prisma.product.findUnique({
      where: { id }
    });

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const newStock = product.currentStock + quantity;

    if (newStock < 0) {
      return res.status(400).json({ 
        error: 'Adjustment would result in negative stock',
        currentStock: product.currentStock,
        adjustment: quantity,
        resultingStock: newStock
      });
    }

    // Update stock and create movement record
    const [updatedProduct, stockMovement] = await prisma.$transaction([
      prisma.product.update({
        where: { id },
        data: { currentStock: newStock }
      }),
      prisma.stockMovement.create({
        data: {
          productId: id,
          type,
          quantity,
          reference,
          notes: notes || `Stock ${type.toLowerCase()} by ${req.user.firstName} ${req.user.lastName}`
        }
      })
    ]);

    // Log the adjustment
    await auditLog('STOCK_ADJUST', 'Product', id, 
      { currentStock: product.currentStock }, 
      { currentStock: newStock, adjustment: quantity }, 
      req
    );

    // Check for low stock alert
    if (newStock <= product.minStock) {
      sendToRole('MANAGER', 'stock_alert', {
        product: updatedProduct,
        currentStock: newStock,
        minStock: product.minStock,
        alertType: 'LOW_STOCK'
      });
      sendToRole('OWNER', 'stock_alert', {
        product: updatedProduct,
        currentStock: newStock,
        minStock: product.minStock,
        alertType: 'LOW_STOCK'
      });
    }

    logger.info(`Stock adjusted: ${product.name} ${quantity > 0 ? '+' : ''}${quantity} by ${req.user.email}`);

    res.json({
      message: 'Stock adjusted successfully',
      product: updatedProduct,
      stockMovement,
      previousStock: product.currentStock,
      newStock
    });
  } catch (error) {
    logger.error('Stock adjustment error:', error);
    res.status(500).json({ error: 'Failed to adjust stock' });
  }
});

// Get stock movements for a product
router.get('/:id/stock/movements', [
  authenticateToken,
  canManageInventory,
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 })
], async (req, res) => {
  try {
    const { id } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const [movements, total] = await Promise.all([
      prisma.stockMovement.findMany({
        where: { productId: id },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit
      }),
      prisma.stockMovement.count({
        where: { productId: id }
      })
    ]);

    res.json({
      movements,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    logger.error('Stock movements fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch stock movements' });
  }
});

// Delete product
router.delete('/:id', [authenticateToken, canManageInventory], async (req, res) => {
  try {
    const { id } = req.params;

    const product = await prisma.product.findUnique({
      where: { id },
      include: {
        saleItems: { take: 1 },
        purchaseItems: { take: 1 }
      }
    });

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    // Check if product has been used in sales or purchases
    if (product.saleItems.length > 0 || product.purchaseItems.length > 0) {
      // Soft delete - mark as discontinued
      const updatedProduct = await prisma.product.update({
        where: { id },
        data: { status: 'DISCONTINUED' }
      });

      await auditLog('PRODUCT_DISCONTINUE', 'Product', id, product, updatedProduct, req);

      return res.json({
        message: 'Product marked as discontinued (cannot delete due to transaction history)',
        product: updatedProduct
      });
    }

    // Hard delete if no transaction history
    await prisma.product.delete({
      where: { id }
    });

    // Remove image file if exists
    if (product.image) {
      try {
        const imagePath = path.join(__dirname, '../../', product.image);
        await fs.unlink(imagePath);
      } catch (error) {
        logger.warn('Failed to remove product image:', error);
      }
    }

    await auditLog('PRODUCT_DELETE', 'Product', id, product, null, req);

    logger.info(`Product deleted: ${product.name} (${product.sku}) by ${req.user.email}`);

    res.json({ message: 'Product deleted successfully' });
  } catch (error) {
    logger.error('Product deletion error:', error);
    res.status(500).json({ error: 'Failed to delete product' });
  }
});

module.exports = router;