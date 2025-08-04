const express = require('express');
const { body, validationResult } = require('express-validator');
const { PrismaClient } = require('@prisma/client');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const sharp = require('sharp');
const { v4: uuidv4 } = require('uuid');

const router = express.Router();
const prisma = new PrismaClient();

// Middleware to check if user is authenticated
const authenticateToken = require('../middleware/auth');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads');
    try {
      await fs.mkdir(uploadDir, { recursive: true });
      cb(null, uploadDir);
    } catch (error) {
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    const uniqueName = `${uuidv4()}-${file.originalname}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Allow images, documents, and common file types
    const allowedTypes = [
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/csv',
      'text/plain'
    ];

    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type'), false);
    }
  }
});

// Get all files with pagination and filtering
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      search,
      type,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const skip = (page - 1) * limit;
    
    const where = {};
    
    if (search) {
      where.originalName = {
        contains: search,
        mode: 'insensitive'
      };
    }
    
    if (type) {
      where.mimeType = {
        startsWith: type
      };
    }

    const files = await prisma.fileUpload.findMany({
      where,
      skip: parseInt(skip),
      take: parseInt(limit),
      orderBy: { [sortBy]: sortOrder }
    });

    const total = await prisma.fileUpload.count({ where });

    res.json({
      files,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching files:', error);
    res.status(500).json({ error: 'Failed to fetch files' });
  }
});

// Upload single file
router.post('/upload', authenticateToken, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Process image files
    let processedPath = req.file.path;
    if (req.file.mimetype.startsWith('image/')) {
      try {
        const processedFilename = `processed-${req.file.filename}`;
        const processedFilePath = path.join(path.dirname(req.file.path), processedFilename);
        
        await sharp(req.file.path)
          .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 80 })
          .toFile(processedFilePath);
        
        processedPath = processedFilePath;
      } catch (error) {
        console.error('Error processing image:', error);
      }
    }

    const file = await prisma.fileUpload.create({
      data: {
        filename: req.file.filename,
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
        size: req.file.size,
        path: processedPath,
        uploadedBy: req.user.id
      }
    });

    res.status(201).json(file);
  } catch (error) {
    console.error('Error uploading file:', error);
    res.status(500).json({ error: 'Failed to upload file' });
  }
});

// Upload multiple files
router.post('/upload-multiple', authenticateToken, upload.array('files', 10), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    const uploadedFiles = [];

    for (const file of req.files) {
      // Process image files
      let processedPath = file.path;
      if (file.mimetype.startsWith('image/')) {
        try {
          const processedFilename = `processed-${file.filename}`;
          const processedFilePath = path.join(path.dirname(file.path), processedFilename);
          
          await sharp(file.path)
            .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
            .jpeg({ quality: 80 })
            .toFile(processedFilePath);
          
          processedPath = processedFilePath;
        } catch (error) {
          console.error('Error processing image:', error);
        }
      }

      const uploadedFile = await prisma.fileUpload.create({
        data: {
          filename: file.filename,
          originalName: file.originalname,
          mimeType: file.mimetype,
          size: file.size,
          path: processedPath,
          uploadedBy: req.user.id
        }
      });

      uploadedFiles.push(uploadedFile);
    }

    res.status(201).json({
      message: `Successfully uploaded ${uploadedFiles.length} files`,
      files: uploadedFiles
    });
  } catch (error) {
    console.error('Error uploading files:', error);
    res.status(500).json({ error: 'Failed to upload files' });
  }
});

// Download file
router.get('/download/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const file = await prisma.fileUpload.findUnique({
      where: { id }
    });

    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    const filePath = path.join(__dirname, '..', file.path);
    
    // Check if file exists
    try {
      await fs.access(filePath);
    } catch (error) {
      return res.status(404).json({ error: 'File not found on disk' });
    }

    res.download(filePath, file.originalName);
  } catch (error) {
    console.error('Error downloading file:', error);
    res.status(500).json({ error: 'Failed to download file' });
  }
});

// Get file info
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const file = await prisma.fileUpload.findUnique({
      where: { id },
      include: {
        uploadedBy: {
          select: {
            firstName: true,
            lastName: true,
            email: true
          }
        }
      }
    });

    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    res.json(file);
  } catch (error) {
    console.error('Error fetching file info:', error);
    res.status(500).json({ error: 'Failed to fetch file info' });
  }
});

// Delete file
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const file = await prisma.fileUpload.findUnique({
      where: { id }
    });

    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Delete file from disk
    try {
      const filePath = path.join(__dirname, '..', file.path);
      await fs.unlink(filePath);
    } catch (error) {
      console.error('Error deleting file from disk:', error);
    }

    // Delete from database
    await prisma.fileUpload.delete({
      where: { id }
    });

    res.json({ message: 'File deleted successfully' });
  } catch (error) {
    console.error('Error deleting file:', error);
    res.status(500).json({ error: 'Failed to delete file' });
  }
});

// Bulk delete files
router.delete('/bulk', authenticateToken, [
  body('fileIds').isArray().withMessage('File IDs array is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { fileIds } = req.body;

    const files = await prisma.fileUpload.findMany({
      where: {
        id: { in: fileIds }
      }
    });

    // Delete files from disk
    for (const file of files) {
      try {
        const filePath = path.join(__dirname, '..', file.path);
        await fs.unlink(filePath);
      } catch (error) {
        console.error('Error deleting file from disk:', error);
      }
    }

    // Delete from database
    await prisma.fileUpload.deleteMany({
      where: {
        id: { in: fileIds }
      }
    });

    res.json({
      message: `Successfully deleted ${files.length} files`,
      count: files.length
    });
  } catch (error) {
    console.error('Error bulk deleting files:', error);
    res.status(500).json({ error: 'Failed to delete files' });
  }
});

// Get file statistics
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    const totalFiles = await prisma.fileUpload.count();
    const totalSize = await prisma.fileUpload.aggregate({
      _sum: { size: true }
    });

    // File types breakdown
    const fileTypes = await prisma.fileUpload.groupBy({
      by: ['mimeType'],
      _count: { mimeType: true },
      _sum: { size: true }
    });

    // Recent uploads
    const recentUploads = await prisma.fileUpload.findMany({
      take: 10,
      orderBy: { createdAt: 'desc' },
      include: {
        uploadedBy: {
          select: {
            firstName: true,
            lastName: true
          }
        }
      }
    });

    res.json({
      totalFiles,
      totalSize: totalSize._sum.size || 0,
      fileTypes,
      recentUploads
    });
  } catch (error) {
    console.error('Error fetching file statistics:', error);
    res.status(500).json({ error: 'Failed to fetch file statistics' });
  }
});

// Search files
router.get('/search', authenticateToken, async (req, res) => {
  try {
    const { q, type, sizeMin, sizeMax, dateFrom, dateTo } = req.query;

    const where = {};

    if (q) {
      where.originalName = {
        contains: q,
        mode: 'insensitive'
      };
    }

    if (type) {
      where.mimeType = {
        startsWith: type
      };
    }

    if (sizeMin || sizeMax) {
      where.size = {};
      if (sizeMin) where.size.gte = parseInt(sizeMin);
      if (sizeMax) where.size.lte = parseInt(sizeMax);
    }

    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) where.createdAt.gte = new Date(dateFrom);
      if (dateTo) where.createdAt.lte = new Date(dateTo);
    }

    const files = await prisma.fileUpload.findMany({
      where,
      include: {
        uploadedBy: {
          select: {
            firstName: true,
            lastName: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json(files);
  } catch (error) {
    console.error('Error searching files:', error);
    res.status(500).json({ error: 'Failed to search files' });
  }
});

// Generate file preview URL (for images)
router.get('/:id/preview', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const file = await prisma.fileUpload.findUnique({
      where: { id }
    });

    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Only generate preview for images
    if (!file.mimeType.startsWith('image/')) {
      return res.status(400).json({ error: 'Preview not available for this file type' });
    }

    const filePath = path.join(__dirname, '..', file.path);
    
    // Check if file exists
    try {
      await fs.access(filePath);
    } catch (error) {
      return res.status(404).json({ error: 'File not found on disk' });
    }

    res.sendFile(filePath);
  } catch (error) {
    console.error('Error generating file preview:', error);
    res.status(500).json({ error: 'Failed to generate file preview' });
  }
});

module.exports = router;