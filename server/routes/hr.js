const express = require('express');
const { body, validationResult } = require('express-validator');
const { PrismaClient } = require('@prisma/client');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { logger } = require('../utils/logger');
const { createAuditLog } = require('../services/auditService');

const router = express.Router();
const prisma = new PrismaClient();

// ==================== EMPLOYEE MANAGEMENT ====================

// Get all employees
router.get('/employees', authenticateToken, async (req, res) => {
  try {
    const { page = 1, limit = 10, search, department, status } = req.query;
    const skip = (page - 1) * limit;

    const where = {};
    
    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { employeeId: { contains: search, mode: 'insensitive' } },
        { position: { contains: search, mode: 'insensitive' } }
      ];
    }

    if (department) {
      where.department = department;
    }

    if (status) {
      where.status = status;
    }

    const [employees, total] = await Promise.all([
      prisma.employee.findMany({
        where,
        include: {
          _count: {
            select: { attendances: true, payrolls: true }
          }
        },
        skip: parseInt(skip),
        take: parseInt(limit),
        orderBy: { firstName: 'asc' }
      }),
      prisma.employee.count({ where })
    ]);

    res.json({
      employees,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    logger.error('Error fetching employees:', error);
    res.status(500).json({ error: 'Failed to fetch employees' });
  }
});

// Get employee by ID
router.get('/employees/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const employee = await prisma.employee.findUnique({
      where: { id },
      include: {
        attendances: {
          orderBy: { date: 'desc' },
          take: 30
        },
        payrolls: {
          orderBy: { period: 'desc' },
          take: 12
        },
        _count: {
          select: { attendances: true, payrolls: true }
        }
      }
    });

    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    res.json(employee);
  } catch (error) {
    logger.error('Error fetching employee:', error);
    res.status(500).json({ error: 'Failed to fetch employee' });
  }
});

// Create new employee
router.post('/employees', [
  authenticateToken,
  requireRole(['OWNER', 'MANAGER']),
  body('firstName').trim().isLength({ min: 1 }).withMessage('First name is required'),
  body('lastName').trim().isLength({ min: 1 }).withMessage('Last name is required'),
  body('email').isEmail().withMessage('Valid email is required'),
  body('phone').optional().trim(),
  body('address').optional().trim(),
  body('dateOfBirth').optional().isISO8601().withMessage('Invalid date format'),
  body('position').trim().isLength({ min: 1 }).withMessage('Position is required'),
  body('department').trim().isLength({ min: 1 }).withMessage('Department is required'),
  body('salary').isFloat({ min: 0 }).withMessage('Salary must be positive')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { firstName, lastName, email, phone, address, dateOfBirth, position, department, salary } = req.body;

    // Check if email already exists
    const existingEmployee = await prisma.employee.findUnique({
      where: { email }
    });

    if (existingEmployee) {
      return res.status(400).json({ error: 'Employee with this email already exists' });
    }

    // Generate employee ID
    const employeeId = `EMP-${Date.now()}-${Math.random().toString(36).substr(2, 5).toUpperCase()}`;

    const employee = await prisma.employee.create({
      data: {
        employeeId,
        firstName,
        lastName,
        email,
        phone,
        address,
        dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
        position,
        department,
        salary: parseFloat(salary)
      }
    });

    // Create audit log
    await createAuditLog({
      userId: req.user.id,
      action: 'CREATE',
      entity: 'Employee',
      entityId: employee.id,
      newValues: employee
    });

    res.status(201).json(employee);
  } catch (error) {
    logger.error('Error creating employee:', error);
    res.status(500).json({ error: 'Failed to create employee' });
  }
});

// Update employee
router.put('/employees/:id', [
  authenticateToken,
  requireRole(['OWNER', 'MANAGER']),
  body('firstName').optional().trim().isLength({ min: 1 }).withMessage('First name cannot be empty'),
  body('lastName').optional().trim().isLength({ min: 1 }).withMessage('Last name cannot be empty'),
  body('email').optional().isEmail().withMessage('Valid email is required'),
  body('phone').optional().trim(),
  body('address').optional().trim(),
  body('dateOfBirth').optional().isISO8601().withMessage('Invalid date format'),
  body('position').optional().trim().isLength({ min: 1 }).withMessage('Position cannot be empty'),
  body('department').optional().trim().isLength({ min: 1 }).withMessage('Department cannot be empty'),
  body('salary').optional().isFloat({ min: 0 }).withMessage('Salary must be positive'),
  body('status').optional().isIn(['ACTIVE', 'INACTIVE', 'TERMINATED', 'ON_LEAVE']).withMessage('Invalid status')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const { firstName, lastName, email, phone, address, dateOfBirth, position, department, salary, status } = req.body;

    // Check if employee exists
    const existingEmployee = await prisma.employee.findUnique({
      where: { id }
    });

    if (!existingEmployee) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    // Check if email is being changed and conflicts
    if (email && email !== existingEmployee.email) {
      const emailConflict = await prisma.employee.findUnique({
        where: { email }
      });

      if (emailConflict) {
        return res.status(400).json({ error: 'Employee with this email already exists' });
      }
    }

    const oldValues = existingEmployee;
    const employee = await prisma.employee.update({
      where: { id },
      data: {
        firstName,
        lastName,
        email,
        phone,
        address,
        dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
        position,
        department,
        salary: salary ? parseFloat(salary) : undefined,
        status
      }
    });

    // Create audit log
    await createAuditLog({
      userId: req.user.id,
      action: 'UPDATE',
      entity: 'Employee',
      entityId: employee.id,
      oldValues,
      newValues: employee
    });

    res.json(employee);
  } catch (error) {
    logger.error('Error updating employee:', error);
    res.status(500).json({ error: 'Failed to update employee' });
  }
});

// Delete employee
router.delete('/employees/:id', [
  authenticateToken,
  requireRole(['OWNER'])
], async (req, res) => {
  try {
    const { id } = req.params;

    const employee = await prisma.employee.findUnique({
      where: { id },
      include: {
        attendances: true,
        payrolls: true
      }
    });

    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    // Check if employee has related data
    if (employee.attendances.length > 0 || employee.payrolls.length > 0) {
      return res.status(400).json({ 
        error: 'Cannot delete employee with attendance or payroll records. Please archive instead.' 
      });
    }

    await prisma.employee.delete({
      where: { id }
    });

    // Create audit log
    await createAuditLog({
      userId: req.user.id,
      action: 'DELETE',
      entity: 'Employee',
      entityId: id,
      oldValues: employee
    });

    res.json({ message: 'Employee deleted successfully' });
  } catch (error) {
    logger.error('Error deleting employee:', error);
    res.status(500).json({ error: 'Failed to delete employee' });
  }
});

// ==================== ATTENDANCE MANAGEMENT ====================

// Get attendance records
router.get('/attendance', authenticateToken, async (req, res) => {
  try {
    const { page = 1, limit = 10, employeeId, startDate, endDate, status } = req.query;
    const skip = (page - 1) * limit;

    const where = {};
    
    if (employeeId) {
      where.employeeId = employeeId;
    }

    if (startDate && endDate) {
      where.date = {
        gte: new Date(startDate),
        lte: new Date(endDate)
      };
    }

    if (status) {
      where.status = status;
    }

    const [attendances, total] = await Promise.all([
      prisma.attendance.findMany({
        where,
        include: {
          employee: {
            select: {
              id: true,
              employeeId: true,
              firstName: true,
              lastName: true,
              position: true,
              department: true
            }
          }
        },
        skip: parseInt(skip),
        take: parseInt(limit),
        orderBy: { date: 'desc' }
      }),
      prisma.attendance.count({ where })
    ]);

    res.json({
      attendances,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    logger.error('Error fetching attendance:', error);
    res.status(500).json({ error: 'Failed to fetch attendance' });
  }
});

// Clock in
router.post('/attendance/clock-in', [
  authenticateToken,
  body('employeeId').isString().withMessage('Employee ID is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { employeeId } = req.body;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Check if employee exists
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId }
    });

    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    // Check if already clocked in today
    const existingAttendance = await prisma.attendance.findFirst({
      where: {
        employeeId,
        date: today
      }
    });

    if (existingAttendance && existingAttendance.clockIn) {
      return res.status(400).json({ error: 'Employee already clocked in today' });
    }

    let attendance;
    if (existingAttendance) {
      // Update existing record
      attendance = await prisma.attendance.update({
        where: { id: existingAttendance.id },
        data: {
          clockIn: new Date(),
          status: 'PRESENT'
        },
        include: {
          employee: {
            select: {
              id: true,
              employeeId: true,
              firstName: true,
              lastName: true
            }
          }
        }
      });
    } else {
      // Create new record
      attendance = await prisma.attendance.create({
        data: {
          employeeId,
          date: today,
          clockIn: new Date(),
          status: 'PRESENT'
        },
        include: {
          employee: {
            select: {
              id: true,
              employeeId: true,
              firstName: true,
              lastName: true
            }
          }
        }
      });
    }

    res.status(201).json(attendance);
  } catch (error) {
    logger.error('Error clocking in:', error);
    res.status(500).json({ error: 'Failed to clock in' });
  }
});

// Clock out
router.post('/attendance/clock-out', [
  authenticateToken,
  body('employeeId').isString().withMessage('Employee ID is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { employeeId } = req.body;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Check if employee exists
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId }
    });

    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    // Find today's attendance record
    const attendance = await prisma.attendance.findFirst({
      where: {
        employeeId,
        date: today
      }
    });

    if (!attendance || !attendance.clockIn) {
      return res.status(400).json({ error: 'Employee has not clocked in today' });
    }

    if (attendance.clockOut) {
      return res.status(400).json({ error: 'Employee already clocked out today' });
    }

    const clockOut = new Date();
    const clockIn = new Date(attendance.clockIn);
    const totalHours = (clockOut - clockIn) / (1000 * 60 * 60); // Convert to hours

    const updatedAttendance = await prisma.attendance.update({
      where: { id: attendance.id },
      data: {
        clockOut,
        totalHours: parseFloat(totalHours.toFixed(2))
      },
      include: {
        employee: {
          select: {
            id: true,
            employeeId: true,
            firstName: true,
            lastName: true
          }
        }
      }
    });

    res.json(updatedAttendance);
  } catch (error) {
    logger.error('Error clocking out:', error);
    res.status(500).json({ error: 'Failed to clock out' });
  }
});

// ==================== PAYROLL MANAGEMENT ====================

// Get payroll records
router.get('/payroll', [
  authenticateToken,
  requireRole(['OWNER', 'MANAGER'])
], async (req, res) => {
  try {
    const { page = 1, limit = 10, employeeId, period, status } = req.query;
    const skip = (page - 1) * limit;

    const where = {};
    
    if (employeeId) {
      where.employeeId = employeeId;
    }

    if (period) {
      where.period = period;
    }

    if (status) {
      where.status = status;
    }

    const [payrolls, total] = await Promise.all([
      prisma.payroll.findMany({
        where,
        include: {
          employee: {
            select: {
              id: true,
              employeeId: true,
              firstName: true,
              lastName: true,
              position: true,
              department: true
            }
          }
        },
        skip: parseInt(skip),
        take: parseInt(limit),
        orderBy: { period: 'desc' }
      }),
      prisma.payroll.count({ where })
    ]);

    res.json({
      payrolls,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    logger.error('Error fetching payroll:', error);
    res.status(500).json({ error: 'Failed to fetch payroll' });
  }
});

// Generate payroll
router.post('/payroll/generate', [
  authenticateToken,
  requireRole(['OWNER', 'MANAGER']),
  body('employeeId').isString().withMessage('Employee ID is required'),
  body('period').isString().withMessage('Period is required (e.g., 2024-01)'),
  body('allowances').optional().isFloat({ min: 0 }).withMessage('Allowances must be positive'),
  body('deductions').optional().isFloat({ min: 0 }).withMessage('Deductions must be positive'),
  body('overtime').optional().isFloat({ min: 0 }).withMessage('Overtime must be positive')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { employeeId, period, allowances = 0, deductions = 0, overtime = 0 } = req.body;

    // Check if employee exists
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId }
    });

    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    // Check if payroll already exists for this period
    const existingPayroll = await prisma.payroll.findFirst({
      where: {
        employeeId,
        period
      }
    });

    if (existingPayroll) {
      return res.status(400).json({ error: 'Payroll already exists for this period' });
    }

    // Calculate net salary
    const basicSalary = parseFloat(employee.salary);
    const totalAllowances = parseFloat(allowances);
    const totalDeductions = parseFloat(deductions);
    const overtimePay = parseFloat(overtime);
    const netSalary = basicSalary + totalAllowances + overtimePay - totalDeductions;

    const payroll = await prisma.payroll.create({
      data: {
        employeeId,
        period,
        basicSalary,
        allowances: totalAllowances,
        deductions: totalDeductions,
        overtime: overtimePay,
        netSalary
      },
      include: {
        employee: {
          select: {
            id: true,
            employeeId: true,
            firstName: true,
            lastName: true,
            position: true,
            department: true
          }
        }
      }
    });

    res.status(201).json(payroll);
  } catch (error) {
    logger.error('Error generating payroll:', error);
    res.status(500).json({ error: 'Failed to generate payroll' });
  }
});

// Update payroll status
router.put('/payroll/:id/status', [
  authenticateToken,
  requireRole(['OWNER', 'MANAGER']),
  body('status').isIn(['PENDING', 'PROCESSED', 'PAID', 'CANCELLED']).withMessage('Invalid status')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const { status } = req.body;

    const payroll = await prisma.payroll.findUnique({
      where: { id }
    });

    if (!payroll) {
      return res.status(404).json({ error: 'Payroll not found' });
    }

    const updatedPayroll = await prisma.payroll.update({
      where: { id },
      data: {
        status,
        paidDate: status === 'PAID' ? new Date() : null
      },
      include: {
        employee: {
          select: {
            id: true,
            employeeId: true,
            firstName: true,
            lastName: true
          }
        }
      }
    });

    res.json(updatedPayroll);
  } catch (error) {
    logger.error('Error updating payroll status:', error);
    res.status(500).json({ error: 'Failed to update payroll status' });
  }
});

module.exports = router;