const express = require('express');
const { body, validationResult } = require('express-validator');
const { PrismaClient } = require('@prisma/client');
const { createAuditLog } = require('../services/auditService');

const router = express.Router();
const prisma = new PrismaClient();

// Middleware to check authentication
const authenticateToken = require('../middleware/auth');

// Apply authentication to all routes
router.use(authenticateToken);

// ==================== CHART OF ACCOUNTS ====================

// Get all accounts
router.get('/accounts', async (req, res) => {
  try {
    const { search, type, category, page = 1, limit = 20 } = req.query;
    const skip = (page - 1) * limit;

    const where = {
      isActive: true,
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { code: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } }
        ]
      }),
      ...(type && { type }),
      ...(category && { category })
    };

    const [accounts, total] = await Promise.all([
      prisma.account.findMany({
        where,
        orderBy: { code: 'asc' },
        skip: parseInt(skip),
        take: parseInt(limit)
      }),
      prisma.account.count({ where })
    ]);

    res.json({
      accounts,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching accounts:', error);
    res.status(500).json({ error: 'Failed to fetch accounts' });
  }
});

// Get account by ID
router.get('/accounts/:id', async (req, res) => {
  try {
    const account = await prisma.account.findUnique({
      where: { id: req.params.id },
      include: {
        transactions: {
          orderBy: { date: 'desc' },
          take: 10
        }
      }
    });

    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }

    res.json(account);
  } catch (error) {
    console.error('Error fetching account:', error);
    res.status(500).json({ error: 'Failed to fetch account' });
  }
});

// Create new account
router.post('/accounts', [
  body('code').notEmpty().withMessage('Account code is required'),
  body('name').notEmpty().withMessage('Account name is required'),
  body('type').isIn(['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE']).withMessage('Invalid account type'),
  body('category').notEmpty().withMessage('Account category is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { code, name, type, category, description, currency = 'USD' } = req.body;

    // Check if account code already exists
    const existingAccount = await prisma.account.findUnique({
      where: { code }
    });

    if (existingAccount) {
      return res.status(400).json({ error: 'Account code already exists' });
    }

    const account = await prisma.account.create({
      data: {
        code,
        name,
        type,
        category,
        description,
        currency
      }
    });

    // Audit log
    await createAuditLog({
      userId: req.user.id,
      action: 'CREATE',
      entity: 'Account',
      entityId: account.id,
      newValues: account,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.status(201).json(account);
  } catch (error) {
    console.error('Error creating account:', error);
    res.status(500).json({ error: 'Failed to create account' });
  }
});

// Update account
router.put('/accounts/:id', [
  body('name').notEmpty().withMessage('Account name is required'),
  body('type').isIn(['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE']).withMessage('Invalid account type'),
  body('category').notEmpty().withMessage('Account category is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, type, category, description, isActive } = req.body;

    const oldAccount = await prisma.account.findUnique({
      where: { id: req.params.id }
    });

    if (!oldAccount) {
      return res.status(404).json({ error: 'Account not found' });
    }

    const account = await prisma.account.update({
      where: { id: req.params.id },
      data: {
        name,
        type,
        category,
        description,
        isActive
      }
    });

    // Audit log
    await createAuditLog({
      userId: req.user.id,
      action: 'UPDATE',
      entity: 'Account',
      entityId: account.id,
      oldValues: oldAccount,
      newValues: account,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.json(account);
  } catch (error) {
    console.error('Error updating account:', error);
    res.status(500).json({ error: 'Failed to update account' });
  }
});

// Delete account
router.delete('/accounts/:id', async (req, res) => {
  try {
    const account = await prisma.account.findUnique({
      where: { id: req.params.id },
      include: {
        transactions: true
      }
    });

    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }

    if (account.transactions.length > 0) {
      return res.status(400).json({ error: 'Cannot delete account with transactions' });
    }

    await prisma.account.delete({
      where: { id: req.params.id }
    });

    // Audit log
    await createAuditLog({
      userId: req.user.id,
      action: 'DELETE',
      entity: 'Account',
      entityId: req.params.id,
      oldValues: account,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.json({ message: 'Account deleted successfully' });
  } catch (error) {
    console.error('Error deleting account:', error);
    res.status(500).json({ error: 'Failed to delete account' });
  }
});

// ==================== JOURNAL ENTRIES ====================

// Get all journal entries
router.get('/journal-entries', async (req, res) => {
  try {
    const { search, dateFrom, dateTo, isPosted, page = 1, limit = 20 } = req.query;
    const skip = (page - 1) * limit;

    const where = {
      ...(search && {
        OR: [
          { entryNumber: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
          { reference: { contains: search, mode: 'insensitive' } }
        ]
      }),
      ...(dateFrom && dateTo && {
        date: {
          gte: new Date(dateFrom),
          lte: new Date(dateTo)
        }
      }),
      ...(isPosted !== undefined && { isPosted: isPosted === 'true' })
    };

    const [entries, total] = await Promise.all([
      prisma.journalEntry.findMany({
        where,
        include: {
          journalItems: {
            include: {
              account: true
            }
          }
        },
        orderBy: { date: 'desc' },
        skip: parseInt(skip),
        take: parseInt(limit)
      }),
      prisma.journalEntry.count({ where })
    ]);

    res.json({
      entries,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching journal entries:', error);
    res.status(500).json({ error: 'Failed to fetch journal entries' });
  }
});

// Get journal entry by ID
router.get('/journal-entries/:id', async (req, res) => {
  try {
    const entry = await prisma.journalEntry.findUnique({
      where: { id: req.params.id },
      include: {
        journalItems: {
          include: {
            account: true
          }
        }
      }
    });

    if (!entry) {
      return res.status(404).json({ error: 'Journal entry not found' });
    }

    res.json(entry);
  } catch (error) {
    console.error('Error fetching journal entry:', error);
    res.status(500).json({ error: 'Failed to fetch journal entry' });
  }
});

// Create journal entry
router.post('/journal-entries', [
  body('description').notEmpty().withMessage('Description is required'),
  body('date').isISO8601().withMessage('Valid date is required'),
  body('journalItems').isArray({ min: 2 }).withMessage('At least 2 journal items are required'),
  body('journalItems.*.accountId').notEmpty().withMessage('Account ID is required'),
  body('journalItems.*.debit').isFloat({ min: 0 }).withMessage('Debit must be a positive number'),
  body('journalItems.*.credit').isFloat({ min: 0 }).withMessage('Credit must be a positive number')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { description, date, reference, journalItems } = req.body;

    // Validate double-entry accounting
    const totalDebits = journalItems.reduce((sum, item) => sum + parseFloat(item.debit || 0), 0);
    const totalCredits = journalItems.reduce((sum, item) => sum + parseFloat(item.credit || 0), 0);

    if (Math.abs(totalDebits - totalCredits) > 0.01) {
      return res.status(400).json({ error: 'Debits and credits must be equal' });
    }

    // Generate entry number
    const lastEntry = await prisma.journalEntry.findFirst({
      orderBy: { entryNumber: 'desc' }
    });

    const entryNumber = lastEntry 
      ? `JE${String(parseInt(lastEntry.entryNumber.slice(2)) + 1).padStart(6, '0')}`
      : 'JE000001';

    const entry = await prisma.journalEntry.create({
      data: {
        entryNumber,
        date: new Date(date),
        description,
        reference,
        journalItems: {
          create: journalItems.map(item => ({
            accountId: item.accountId,
            debit: parseFloat(item.debit || 0),
            credit: parseFloat(item.credit || 0),
            description: item.description
          }))
        }
      },
      include: {
        journalItems: {
          include: {
            account: true
          }
        }
      }
    });

    // Audit log
    await createAuditLog({
      userId: req.user.id,
      action: 'CREATE',
      entity: 'JournalEntry',
      entityId: entry.id,
      newValues: entry,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.status(201).json(entry);
  } catch (error) {
    console.error('Error creating journal entry:', error);
    res.status(500).json({ error: 'Failed to create journal entry' });
  }
});

// Post journal entry
router.post('/journal-entries/:id/post', async (req, res) => {
  try {
    const entry = await prisma.journalEntry.findUnique({
      where: { id: req.params.id },
      include: {
        journalItems: {
          include: {
            account: true
          }
        }
      }
    });

    if (!entry) {
      return res.status(404).json({ error: 'Journal entry not found' });
    }

    if (entry.isPosted) {
      return res.status(400).json({ error: 'Journal entry is already posted' });
    }

    // Update account balances
    for (const item of entry.journalItems) {
      await prisma.account.update({
        where: { id: item.accountId },
        data: {
          balance: {
            increment: parseFloat(item.debit) - parseFloat(item.credit)
          }
        }
      });
    }

    // Mark as posted
    const updatedEntry = await prisma.journalEntry.update({
      where: { id: req.params.id },
      data: {
        isPosted: true,
        postedAt: new Date(),
        postedBy: req.user.id
      },
      include: {
        journalItems: {
          include: {
            account: true
          }
        }
      }
    });

    // Audit log
    await createAuditLog({
      userId: req.user.id,
      action: 'POST',
      entity: 'JournalEntry',
      entityId: entry.id,
      oldValues: entry,
      newValues: updatedEntry,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.json(updatedEntry);
  } catch (error) {
    console.error('Error posting journal entry:', error);
    res.status(500).json({ error: 'Failed to post journal entry' });
  }
});

// ==================== BANK ACCOUNTS ====================

// Get all bank accounts
router.get('/bank-accounts', async (req, res) => {
  try {
    const { search, isActive, page = 1, limit = 20 } = req.query;
    const skip = (page - 1) * limit;

    const where = {
      ...(search && {
        OR: [
          { accountNumber: { contains: search, mode: 'insensitive' } },
          { bankName: { contains: search, mode: 'insensitive' } }
        ]
      }),
      ...(isActive !== undefined && { isActive: isActive === 'true' })
    };

    const [accounts, total] = await Promise.all([
      prisma.bankAccount.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: parseInt(skip),
        take: parseInt(limit)
      }),
      prisma.bankAccount.count({ where })
    ]);

    res.json({
      accounts,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching bank accounts:', error);
    res.status(500).json({ error: 'Failed to fetch bank accounts' });
  }
});

// Get bank account by ID
router.get('/bank-accounts/:id', async (req, res) => {
  try {
    const account = await prisma.bankAccount.findUnique({
      where: { id: req.params.id },
      include: {
        bankTransactions: {
          orderBy: { transactionDate: 'desc' },
          take: 20
        }
      }
    });

    if (!account) {
      return res.status(404).json({ error: 'Bank account not found' });
    }

    res.json(account);
  } catch (error) {
    console.error('Error fetching bank account:', error);
    res.status(500).json({ error: 'Failed to fetch bank account' });
  }
});

// Create bank account
router.post('/bank-accounts', [
  body('accountNumber').notEmpty().withMessage('Account number is required'),
  body('bankName').notEmpty().withMessage('Bank name is required'),
  body('accountType').notEmpty().withMessage('Account type is required'),
  body('balance').isFloat({ min: 0 }).withMessage('Balance must be a positive number')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { accountNumber, bankName, accountType, balance, currency = 'USD' } = req.body;

    // Check if account number already exists
    const existingAccount = await prisma.bankAccount.findUnique({
      where: { accountNumber }
    });

    if (existingAccount) {
      return res.status(400).json({ error: 'Account number already exists' });
    }

    const account = await prisma.bankAccount.create({
      data: {
        accountNumber,
        bankName,
        accountType,
        balance: parseFloat(balance),
        currency
      }
    });

    // Audit log
    await createAuditLog({
      userId: req.user.id,
      action: 'CREATE',
      entity: 'BankAccount',
      entityId: account.id,
      newValues: account,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.status(201).json(account);
  } catch (error) {
    console.error('Error creating bank account:', error);
    res.status(500).json({ error: 'Failed to create bank account' });
  }
});

// Update bank account
router.put('/bank-accounts/:id', [
  body('bankName').notEmpty().withMessage('Bank name is required'),
  body('accountType').notEmpty().withMessage('Account type is required'),
  body('balance').isFloat({ min: 0 }).withMessage('Balance must be a positive number')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { bankName, accountType, balance, currency, isActive } = req.body;

    const oldAccount = await prisma.bankAccount.findUnique({
      where: { id: req.params.id }
    });

    if (!oldAccount) {
      return res.status(404).json({ error: 'Bank account not found' });
    }

    const account = await prisma.bankAccount.update({
      where: { id: req.params.id },
      data: {
        bankName,
        accountType,
        balance: parseFloat(balance),
        currency,
        isActive
      }
    });

    // Audit log
    await createAuditLog({
      userId: req.user.id,
      action: 'UPDATE',
      entity: 'BankAccount',
      entityId: account.id,
      oldValues: oldAccount,
      newValues: account,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.json(account);
  } catch (error) {
    console.error('Error updating bank account:', error);
    res.status(500).json({ error: 'Failed to update bank account' });
  }
});

// ==================== BANK TRANSACTIONS ====================

// Get bank transactions
router.get('/bank-transactions', async (req, res) => {
  try {
    const { bankAccountId, type, dateFrom, dateTo, isReconciled, page = 1, limit = 20 } = req.query;
    const skip = (page - 1) * limit;

    const where = {
      ...(bankAccountId && { bankAccountId }),
      ...(type && { type }),
      ...(dateFrom && dateTo && {
        transactionDate: {
          gte: new Date(dateFrom),
          lte: new Date(dateTo)
        }
      }),
      ...(isReconciled !== undefined && { isReconciled: isReconciled === 'true' })
    };

    const [transactions, total] = await Promise.all([
      prisma.bankTransaction.findMany({
        where,
        include: {
          bankAccount: true
        },
        orderBy: { transactionDate: 'desc' },
        skip: parseInt(skip),
        take: parseInt(limit)
      }),
      prisma.bankTransaction.count({ where })
    ]);

    res.json({
      transactions,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching bank transactions:', error);
    res.status(500).json({ error: 'Failed to fetch bank transactions' });
  }
});

// Create bank transaction
router.post('/bank-transactions', [
  body('bankAccountId').notEmpty().withMessage('Bank account ID is required'),
  body('transactionDate').isISO8601().withMessage('Valid transaction date is required'),
  body('description').notEmpty().withMessage('Description is required'),
  body('amount').isFloat().withMessage('Amount must be a number'),
  body('type').isIn(['DEPOSIT', 'WITHDRAWAL', 'TRANSFER', 'FEE', 'INTEREST']).withMessage('Invalid transaction type')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { bankAccountId, transactionDate, description, amount, type, reference } = req.body;

    // Verify bank account exists
    const bankAccount = await prisma.bankAccount.findUnique({
      where: { id: bankAccountId }
    });

    if (!bankAccount) {
      return res.status(404).json({ error: 'Bank account not found' });
    }

    const transaction = await prisma.bankTransaction.create({
      data: {
        bankAccountId,
        transactionDate: new Date(transactionDate),
        description,
        amount: parseFloat(amount),
        type,
        reference
      },
      include: {
        bankAccount: true
      }
    });

    // Update bank account balance
    const balanceChange = type === 'WITHDRAWAL' || type === 'FEE' ? -parseFloat(amount) : parseFloat(amount);
    await prisma.bankAccount.update({
      where: { id: bankAccountId },
      data: {
        balance: {
          increment: balanceChange
        }
      }
    });

    // Audit log
    await createAuditLog({
      userId: req.user.id,
      action: 'CREATE',
      entity: 'BankTransaction',
      entityId: transaction.id,
      newValues: transaction,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.status(201).json(transaction);
  } catch (error) {
    console.error('Error creating bank transaction:', error);
    res.status(500).json({ error: 'Failed to create bank transaction' });
  }
});

// ==================== FINANCIAL REPORTS ====================

// Get trial balance
router.get('/reports/trial-balance', async (req, res) => {
  try {
    const { date } = req.query;
    const asOfDate = date ? new Date(date) : new Date();

    const accounts = await prisma.account.findMany({
      where: { isActive: true },
      include: {
        transactions: {
          where: {
            date: { lte: asOfDate }
          }
        }
      },
      orderBy: { code: 'asc' }
    });

    const trialBalance = accounts.map(account => {
      const totalDebits = account.transactions
        .filter(t => t.type === 'DEBIT')
        .reduce((sum, t) => sum + parseFloat(t.amount), 0);
      
      const totalCredits = account.transactions
        .filter(t => t.type === 'CREDIT')
        .reduce((sum, t) => sum + parseFloat(t.amount), 0);

      const balance = totalDebits - totalCredits;

      return {
        accountCode: account.code,
        accountName: account.name,
        accountType: account.type,
        totalDebits,
        totalCredits,
        balance
      };
    });

    const totalDebits = trialBalance.reduce((sum, account) => sum + account.totalDebits, 0);
    const totalCredits = trialBalance.reduce((sum, account) => sum + account.totalCredits, 0);

    res.json({
      asOfDate,
      trialBalance,
      totals: {
        totalDebits,
        totalCredits,
        difference: totalDebits - totalCredits
      }
    });
  } catch (error) {
    console.error('Error generating trial balance:', error);
    res.status(500).json({ error: 'Failed to generate trial balance' });
  }
});

// Get balance sheet
router.get('/reports/balance-sheet', async (req, res) => {
  try {
    const { date } = req.query;
    const asOfDate = date ? new Date(date) : new Date();

    const accounts = await prisma.account.findMany({
      where: { 
        isActive: true,
        type: { in: ['ASSET', 'LIABILITY', 'EQUITY'] }
      },
      include: {
        transactions: {
          where: {
            date: { lte: asOfDate }
          }
        }
      },
      orderBy: { code: 'asc' }
    });

    const assets = accounts.filter(a => a.type === 'ASSET').map(account => {
      const balance = account.transactions.reduce((sum, t) => {
        return sum + (t.type === 'DEBIT' ? parseFloat(t.amount) : -parseFloat(t.amount));
      }, 0);
      return { ...account, balance };
    });

    const liabilities = accounts.filter(a => a.type === 'LIABILITY').map(account => {
      const balance = account.transactions.reduce((sum, t) => {
        return sum + (t.type === 'CREDIT' ? parseFloat(t.amount) : -parseFloat(t.amount));
      }, 0);
      return { ...account, balance };
    });

    const equity = accounts.filter(a => a.type === 'EQUITY').map(account => {
      const balance = account.transactions.reduce((sum, t) => {
        return sum + (t.type === 'CREDIT' ? parseFloat(t.amount) : -parseFloat(t.amount));
      }, 0);
      return { ...account, balance };
    });

    const totalAssets = assets.reduce((sum, a) => sum + a.balance, 0);
    const totalLiabilities = liabilities.reduce((sum, l) => sum + l.balance, 0);
    const totalEquity = equity.reduce((sum, e) => sum + e.balance, 0);

    res.json({
      asOfDate,
      assets,
      liabilities,
      equity,
      totals: {
        totalAssets,
        totalLiabilities,
        totalEquity,
        totalLiabilitiesAndEquity: totalLiabilities + totalEquity
      }
    });
  } catch (error) {
    console.error('Error generating balance sheet:', error);
    res.status(500).json({ error: 'Failed to generate balance sheet' });
  }
});

// Get income statement
router.get('/reports/income-statement', async (req, res) => {
  try {
    const { dateFrom, dateTo } = req.query;
    const fromDate = dateFrom ? new Date(dateFrom) : new Date(new Date().getFullYear(), 0, 1);
    const toDate = dateTo ? new Date(dateTo) : new Date();

    const revenueAccounts = await prisma.account.findMany({
      where: { 
        isActive: true,
        type: 'REVENUE'
      },
      include: {
        transactions: {
          where: {
            date: { gte: fromDate, lte: toDate }
          }
        }
      }
    });

    const expenseAccounts = await prisma.account.findMany({
      where: { 
        isActive: true,
        type: 'EXPENSE'
      },
      include: {
        transactions: {
          where: {
            date: { gte: fromDate, lte: toDate }
          }
        }
      }
    });

    const revenues = revenueAccounts.map(account => {
      const amount = account.transactions.reduce((sum, t) => {
        return sum + (t.type === 'CREDIT' ? parseFloat(t.amount) : -parseFloat(t.amount));
      }, 0);
      return { ...account, amount };
    });

    const expenses = expenseAccounts.map(account => {
      const amount = account.transactions.reduce((sum, t) => {
        return sum + (t.type === 'DEBIT' ? parseFloat(t.amount) : -parseFloat(t.amount));
      }, 0);
      return { ...account, amount };
    });

    const totalRevenue = revenues.reduce((sum, r) => sum + r.amount, 0);
    const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
    const netIncome = totalRevenue - totalExpenses;

    res.json({
      period: { fromDate, toDate },
      revenues,
      expenses,
      totals: {
        totalRevenue,
        totalExpenses,
        netIncome
      }
    });
  } catch (error) {
    console.error('Error generating income statement:', error);
    res.status(500).json({ error: 'Failed to generate income statement' });
  }
});

// Get cash flow statement
router.get('/reports/cash-flow', async (req, res) => {
  try {
    const { dateFrom, dateTo } = req.query;
    const fromDate = dateFrom ? new Date(dateFrom) : new Date(new Date().getFullYear(), 0, 1);
    const toDate = dateTo ? new Date(dateTo) : new Date();

    // Get cash accounts
    const cashAccounts = await prisma.account.findMany({
      where: { 
        isActive: true,
        type: 'ASSET',
        category: { contains: 'Cash' }
      },
      include: {
        transactions: {
          where: {
            date: { gte: fromDate, lte: toDate }
          }
        }
      }
    });

    const operatingActivities = cashAccounts.map(account => {
      const operatingCash = account.transactions
        .filter(t => ['SALE', 'PURCHASE', 'PAYMENT', 'RECEIPT'].includes(t.type))
        .reduce((sum, t) => {
          return sum + (t.type === 'RECEIPT' ? parseFloat(t.amount) : -parseFloat(t.amount));
        }, 0);
      
      return { account, operatingCash };
    });

    const investingActivities = cashAccounts.map(account => {
      const investingCash = account.transactions
        .filter(t => ['TRANSFER', 'ADJUSTMENT'].includes(t.type))
        .reduce((sum, t) => {
          return sum + (t.type === 'TRANSFER' ? parseFloat(t.amount) : -parseFloat(t.amount));
        }, 0);
      
      return { account, investingCash };
    });

    const totalOperatingCash = operatingActivities.reduce((sum, a) => sum + a.operatingCash, 0);
    const totalInvestingCash = investingActivities.reduce((sum, a) => sum + a.investingCash, 0);
    const netCashFlow = totalOperatingCash + totalInvestingCash;

    res.json({
      period: { fromDate, toDate },
      operatingActivities,
      investingActivities,
      totals: {
        totalOperatingCash,
        totalInvestingCash,
        netCashFlow
      }
    });
  } catch (error) {
    console.error('Error generating cash flow statement:', error);
    res.status(500).json({ error: 'Failed to generate cash flow statement' });
  }
});

module.exports = router;