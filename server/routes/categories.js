const express = require('express');
const { body, validationResult } = require('express-validator');
const { PrismaClient } = require('@prisma/client');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { logger } = require('../utils/logger');
const { createAuditLog } = require('../services/auditService');

const router = express.Router();
const prisma = new PrismaClient();

// Get all categories
router.get('/', authenticateToken, async (req, res) => {
  try {
    const categories = await prisma.category.findMany({
      include: {
        parent: true,
        children: true,
        _count: {
          select: { products: true }
        }
      },
      orderBy: { name: 'asc' }
    });

    res.json(categories);
  } catch (error) {
    logger.error('Error fetching categories:', error);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

// Get category by ID
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const category = await prisma.category.findUnique({
      where: { id },
      include: {
        parent: true,
        children: true,
        products: {
          include: {
            category: true,
            supplier: true
          }
        }
      }
    });

    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }

    res.json(category);
  } catch (error) {
    logger.error('Error fetching category:', error);
    res.status(500).json({ error: 'Failed to fetch category' });
  }
});

// Create new category
router.post('/', [
  authenticateToken,
  requireRole(['OWNER', 'MANAGER']),
  body('name').trim().isLength({ min: 1 }).withMessage('Name is required'),
  body('description').optional().trim(),
  body('parentId').optional().isString()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, description, parentId } = req.body;

    // Check if category with same name exists
    const existingCategory = await prisma.category.findUnique({
      where: { name }
    });

    if (existingCategory) {
      return res.status(400).json({ error: 'Category with this name already exists' });
    }

    // Validate parent category if provided
    if (parentId) {
      const parentCategory = await prisma.category.findUnique({
        where: { id: parentId }
      });

      if (!parentCategory) {
        return res.status(400).json({ error: 'Parent category not found' });
      }
    }

    const category = await prisma.category.create({
      data: {
        name,
        description,
        parentId
      },
      include: {
        parent: true,
        children: true
      }
    });

    // Create audit log
    await createAuditLog({
      userId: req.user.id,
      action: 'CREATE',
      entity: 'Category',
      entityId: category.id,
      newValues: category
    });

    res.status(201).json(category);
  } catch (error) {
    logger.error('Error creating category:', error);
    res.status(500).json({ error: 'Failed to create category' });
  }
});

// Update category
router.put('/:id', [
  authenticateToken,
  requireRole(['OWNER', 'MANAGER']),
  body('name').optional().trim().isLength({ min: 1 }).withMessage('Name cannot be empty'),
  body('description').optional().trim(),
  body('parentId').optional().isString()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const { name, description, parentId } = req.body;

    // Check if category exists
    const existingCategory = await prisma.category.findUnique({
      where: { id }
    });

    if (!existingCategory) {
      return res.status(404).json({ error: 'Category not found' });
    }

    // Check if name is being changed and if it conflicts
    if (name && name !== existingCategory.name) {
      const nameConflict = await prisma.category.findUnique({
        where: { name }
      });

      if (nameConflict) {
        return res.status(400).json({ error: 'Category with this name already exists' });
      }
    }

    // Validate parent category if provided
    if (parentId) {
      const parentCategory = await prisma.category.findUnique({
        where: { id: parentId }
      });

      if (!parentCategory) {
        return res.status(400).json({ error: 'Parent category not found' });
      }

      // Prevent circular reference
      if (parentId === id) {
        return res.status(400).json({ error: 'Category cannot be its own parent' });
      }
    }

    const oldValues = existingCategory;
    const category = await prisma.category.update({
      where: { id },
      data: {
        name,
        description,
        parentId
      },
      include: {
        parent: true,
        children: true
      }
    });

    // Create audit log
    await createAuditLog({
      userId: req.user.id,
      action: 'UPDATE',
      entity: 'Category',
      entityId: category.id,
      oldValues,
      newValues: category
    });

    res.json(category);
  } catch (error) {
    logger.error('Error updating category:', error);
    res.status(500).json({ error: 'Failed to update category' });
  }
});

// Delete category
router.delete('/:id', [
  authenticateToken,
  requireRole(['OWNER', 'MANAGER'])
], async (req, res) => {
  try {
    const { id } = req.params;

    // Check if category exists
    const category = await prisma.category.findUnique({
      where: { id },
      include: {
        children: true,
        products: true
      }
    });

    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }

    // Check if category has children
    if (category.children.length > 0) {
      return res.status(400).json({ 
        error: 'Cannot delete category with subcategories. Please delete subcategories first.' 
      });
    }

    // Check if category has products
    if (category.products.length > 0) {
      return res.status(400).json({ 
        error: 'Cannot delete category with products. Please reassign or delete products first.' 
      });
    }

    await prisma.category.delete({
      where: { id }
    });

    // Create audit log
    await createAuditLog({
      userId: req.user.id,
      action: 'DELETE',
      entity: 'Category',
      entityId: id,
      oldValues: category
    });

    res.json({ message: 'Category deleted successfully' });
  } catch (error) {
    logger.error('Error deleting category:', error);
    res.status(500).json({ error: 'Failed to delete category' });
  }
});

// Get category hierarchy
router.get('/hierarchy/tree', authenticateToken, async (req, res) => {
  try {
    const categories = await prisma.category.findMany({
      include: {
        children: true,
        _count: {
          select: { products: true }
        }
      },
      orderBy: { name: 'asc' }
    });

    // Build hierarchy tree
    const buildTree = (items, parentId = null) => {
      return items
        .filter(item => item.parentId === parentId)
        .map(item => ({
          ...item,
          children: buildTree(items, item.id)
        }));
    };

    const tree = buildTree(categories);

    res.json(tree);
  } catch (error) {
    logger.error('Error fetching category hierarchy:', error);
    res.status(500).json({ error: 'Failed to fetch category hierarchy' });
  }
});

module.exports = router;