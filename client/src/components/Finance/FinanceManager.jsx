import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Grid,
  Card,
  CardContent,
  IconButton,
  Chip,
  Alert,
  Snackbar,
  CircularProgress,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Autocomplete,
  Divider,
  Tooltip,
  SpeedDial,
  SpeedDialAction,
  SpeedDialIcon,
  Tabs,
  Tab,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  List,
  ListItem,
  ListItemText,
  ListItemIcon
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  AccountBalance as AccountBalanceIcon,
  Receipt as ReceiptIcon,
  Assessment as AssessmentIcon,
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  Search as SearchIcon,
  FilterList as FilterIcon,
  Download as DownloadIcon,
  Refresh as RefreshIcon,
  Visibility as ViewIcon,
  Print as PrintIcon,
  ExpandMore,
  AccountTree as AccountTreeIcon,
  Book as BookIcon,
  CurrencyExchange as CurrencyExchangeIcon,
  Security as SecurityIcon,
  Approval as ApprovalIcon
} from '@mui/icons-material';
import { useFinance } from '../../hooks/useFinance';
import { useSocket } from '../../hooks/useSocket';
import { useSettings } from '../../hooks/useSettings';

const FinanceManager = () => {
  const { 
    accounts, 
    journalEntries, 
    transactions, 
    currencies, 
    exchangeRates,
    loading, 
    error,
    createAccount,
    createJournalEntry,
    createTransaction,
    getFinancialReports
  } = useFinance();
  const { socket } = useSocket();
  const { settings } = useSettings();
  
  const [activeTab, setActiveTab] = useState(0);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilter, setDateFilter] = useState({ start: '', end: '' });
  
  const [accountDialogOpen, setAccountDialogOpen] = useState(false);
  const [journalDialogOpen, setJournalDialogOpen] = useState(false);
  const [transactionDialogOpen, setTransactionDialogOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
  
  const [newAccount, setNewAccount] = useState({
    name: '',
    code: '',
    type: 'ASSET',
    description: '',
    parentId: null
  });

  const [newJournalEntry, setNewJournalEntry] = useState({
    date: new Date().toISOString().split('T')[0],
    reference: '',
    description: '',
    items: []
  });

  const [newTransaction, setNewTransaction] = useState({
    accountId: '',
    type: 'DEBIT',
    amount: 0,
    description: '',
    date: new Date().toISOString().split('T')[0]
  });

  const [financialReports, setFinancialReports] = useState({
    trialBalance: [],
    balanceSheet: {},
    incomeStatement: {},
    cashFlow: {}
  });

  useEffect(() => {
    if (socket) {
      socket.on('financeDashboardUpdated', (data) => {
        setSnackbar({
          open: true,
          message: 'Financial data updated',
          severity: 'info'
        });
      });
    }

    return () => {
      if (socket) {
        socket.off('financeDashboardUpdated');
      }
    };
  }, [socket]);

  useEffect(() => {
    const loadReports = async () => {
      try {
        const reports = await getFinancialReports();
        setFinancialReports(reports);
      } catch (error) {
        console.error('Failed to load financial reports:', error);
      }
    };
    loadReports();
  }, [getFinancialReports]);

  const handleCreateAccount = async () => {
    try {
      await createAccount(newAccount);
      setAccountDialogOpen(false);
      setNewAccount({ name: '', code: '', type: 'ASSET', description: '', parentId: null });
      setSnackbar({
        open: true,
        message: 'Account created successfully',
        severity: 'success'
      });
    } catch (error) {
      setSnackbar({
        open: true,
        message: 'Failed to create account',
        severity: 'error'
      });
    }
  };

  const handleCreateJournalEntry = async () => {
    try {
      await createJournalEntry(newJournalEntry);
      setJournalDialogOpen(false);
      setNewJournalEntry({
        date: new Date().toISOString().split('T')[0],
        reference: '',
        description: '',
        items: []
      });
      setSnackbar({
        open: true,
        message: 'Journal entry created successfully',
        severity: 'success'
      });
    } catch (error) {
      setSnackbar({
        open: true,
        message: 'Failed to create journal entry',
        severity: 'error'
      });
    }
  };

  const handleAddJournalItem = () => {
    setNewJournalEntry(prev => ({
      ...prev,
      items: [...prev.items, { accountId: '', debit: 0, credit: 0, description: '' }]
    }));
  };

  const handleJournalItemChange = (index, field, value) => {
    setNewJournalEntry(prev => ({
      ...prev,
      items: prev.items.map((item, i) => 
        i === index ? { ...item, [field]: value } : item
      ))
    }));
  };

  const getAccountTypeColor = (type) => {
    switch (type) {
      case 'ASSET': return 'success';
      case 'LIABILITY': return 'error';
      case 'EQUITY': return 'primary';
      case 'REVENUE': return 'info';
      case 'EXPENSE': return 'warning';
      default: return 'default';
    }
  };

  const getTransactionTypeIcon = (type) => {
    switch (type) {
      case 'DEBIT': return <TrendingDownIcon color="error" />;
      case 'CREDIT': return <TrendingUpIcon color="success" />;
      default: return <ReceiptIcon />;
    }
  };

  const calculateBalance = (account) => {
    return account.transactions?.reduce((balance, transaction) => {
      if (transaction.type === 'DEBIT') {
        return balance + transaction.amount;
      } else {
        return balance - transaction.amount;
      }
    }, 0) || 0;
  };

  const tabs = [
    { label: 'Chart of Accounts', icon: <AccountTreeIcon /> },
    { label: 'Journal Entries', icon: <BookIcon /> },
    { label: 'Transactions', icon: <ReceiptIcon /> },
    { label: 'Financial Reports', icon: <AssessmentIcon /> },
    { label: 'Currencies', icon: <CurrencyExchangeIcon /> },
    { label: 'Approvals', icon: <ApprovalIcon /> }
  ];

  const actions = [
    { icon: <AddIcon />, name: 'New Account', action: () => setAccountDialogOpen(true) },
    { icon: <BookIcon />, name: 'Journal Entry', action: () => setJournalDialogOpen(true) },
    { icon: <DownloadIcon />, name: 'Export Reports', action: () => console.log('Export') },
    { icon: <RefreshIcon />, name: 'Refresh', action: () => window.location.reload() }
  ];

  const renderChartOfAccounts = () => (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
        <Typography variant="h6">Chart of Accounts</Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setAccountDialogOpen(true)}
        >
          New Account
        </Button>
      </Box>
      
      <Paper>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Code</TableCell>
                <TableCell>Name</TableCell>
                <TableCell>Type</TableCell>
                <TableCell>Balance</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {accounts?.map((account) => (
                <TableRow key={account.id}>
                  <TableCell>
                    <Typography variant="subtitle2" fontWeight="bold">
                      {account.code}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">
                      {account.name}
                    </Typography>
                    {account.description && (
                      <Typography variant="caption" color="textSecondary">
                        {account.description}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={account.type}
                      color={getAccountTypeColor(account.type)}
                      size="small"
                    />
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" fontWeight="bold">
                      ${calculateBalance(account).toFixed(2)}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={account.isActive ? 'Active' : 'Inactive'}
                      color={account.isActive ? 'success' : 'default'}
                      size="small"
                    />
                  </TableCell>
                  <TableCell>
                    <Box display="flex" gap={1}>
                      <Tooltip title="View Details">
                        <IconButton size="small">
                          <ViewIcon />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Edit">
                        <IconButton size="small">
                          <EditIcon />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </Box>
  );

  const renderJournalEntries = () => (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
        <Typography variant="h6">Journal Entries</Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setJournalDialogOpen(true)}
        >
          New Entry
        </Button>
      </Box>
      
      <Paper>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Date</TableCell>
                <TableCell>Reference</TableCell>
                <TableCell>Description</TableCell>
                <TableCell>Debit</TableCell>
                <TableCell>Credit</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {journalEntries?.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell>
                    {new Date(entry.date).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <Typography variant="subtitle2" fontWeight="bold">
                      {entry.reference}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">
                      {entry.description}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" color="error">
                      ${entry.items?.reduce((sum, item) => sum + (item.debit || 0), 0).toFixed(2)}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" color="success.main">
                      ${entry.items?.reduce((sum, item) => sum + (item.credit || 0), 0).toFixed(2)}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={entry.status || 'DRAFT'}
                      color={entry.status === 'POSTED' ? 'success' : 'default'}
                      size="small"
                    />
                  </TableCell>
                  <TableCell>
                    <Box display="flex" gap={1}>
                      <Tooltip title="View Details">
                        <IconButton size="small">
                          <ViewIcon />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Post Entry">
                        <IconButton size="small" color="success">
                          <ReceiptIcon />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </Box>
  );

  const renderFinancialReports = () => (
    <Box>
      <Typography variant="h6" gutterBottom>Financial Reports</Typography>
      
      <Grid container spacing={3}>
        {/* Trial Balance */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Trial Balance
              </Typography>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Account</TableCell>
                    <TableCell align="right">Debit</TableCell>
                    <TableCell align="right">Credit</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {financialReports.trialBalance?.map((item) => (
                    <TableRow key={item.accountId}>
                      <TableCell>{item.accountName}</TableCell>
                      <TableCell align="right">${item.debit.toFixed(2)}</TableCell>
                      <TableCell align="right">${item.credit.toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </Grid>

        {/* Balance Sheet */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Balance Sheet
              </Typography>
              <Accordion>
                <AccordionSummary expandIcon={<ExpandMore />}>
                  <Typography>Assets</Typography>
                </AccordionSummary>
                <AccordionDetails>
                  <List dense>
                    {financialReports.balanceSheet?.assets?.map((asset) => (
                      <ListItem key={asset.accountId}>
                        <ListItemText
                          primary={asset.accountName}
                          secondary={`$${asset.balance.toFixed(2)}`}
                        />
                      </ListItem>
                    ))}
                  </List>
                </AccordionDetails>
              </Accordion>
              <Accordion>
                <AccordionSummary expandIcon={<ExpandMore />}>
                  <Typography>Liabilities</Typography>
                </AccordionSummary>
                <AccordionDetails>
                  <List dense>
                    {financialReports.balanceSheet?.liabilities?.map((liability) => (
                      <ListItem key={liability.accountId}>
                        <ListItemText
                          primary={liability.accountName}
                          secondary={`$${liability.balance.toFixed(2)}`}
                        />
                      </ListItem>
                    ))}
                  </List>
                </AccordionDetails>
              </Accordion>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );

  const renderTabContent = () => {
    switch (activeTab) {
      case 0:
        return renderChartOfAccounts();
      case 1:
        return renderJournalEntries();
      case 2:
        return renderTransactions();
      case 3:
        return renderFinancialReports();
      case 4:
        return renderCurrencies();
      case 5:
        return renderApprovals();
      default:
        return null;
    }
  };

  return (
    <Box>
      {/* Header */}
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4" component="h1">
          Finance & Accounting
        </Typography>
      </Box>

      {/* Tabs */}
      <Paper sx={{ mb: 3 }}>
        <Tabs
          value={activeTab}
          onChange={(event, newValue) => setActiveTab(newValue)}
          variant="scrollable"
          scrollButtons="auto"
        >
          {tabs.map((tab, index) => (
            <Tab
              key={tab.label}
              label={tab.label}
              icon={tab.icon}
              iconPosition="start"
            />
          ))}
        </Tabs>
      </Paper>

      {/* Tab Content */}
      {renderTabContent()}

      {/* Create Account Dialog */}
      <Dialog
        open={accountDialogOpen}
        onClose={() => setAccountDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Create New Account</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Account Code"
                value={newAccount.code}
                onChange={(e) => setNewAccount(prev => ({ ...prev, code: e.target.value }))}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <FormControl fullWidth>
                <InputLabel>Account Type</InputLabel>
                <Select
                  value={newAccount.type}
                  onChange={(e) => setNewAccount(prev => ({ ...prev, type: e.target.value }))}
                >
                  <MenuItem value="ASSET">Asset</MenuItem>
                  <MenuItem value="LIABILITY">Liability</MenuItem>
                  <MenuItem value="EQUITY">Equity</MenuItem>
                  <MenuItem value="REVENUE">Revenue</MenuItem>
                  <MenuItem value="EXPENSE">Expense</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Account Name"
                value={newAccount.name}
                onChange={(e) => setNewAccount(prev => ({ ...prev, name: e.target.value }))}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                multiline
                rows={3}
                label="Description"
                value={newAccount.description}
                onChange={(e) => setNewAccount(prev => ({ ...prev, description: e.target.value }))}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAccountDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleCreateAccount}
            disabled={!newAccount.code || !newAccount.name}
          >
            Create Account
          </Button>
        </DialogActions>
      </Dialog>

      {/* Create Journal Entry Dialog */}
      <Dialog
        open={journalDialogOpen}
        onClose={() => setJournalDialogOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>Create Journal Entry</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                type="date"
                label="Date"
                value={newJournalEntry.date}
                onChange={(e) => setNewJournalEntry(prev => ({ ...prev, date: e.target.value }))}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Reference"
                value={newJournalEntry.reference}
                onChange={(e) => setNewJournalEntry(prev => ({ ...prev, reference: e.target.value }))}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                multiline
                rows={2}
                label="Description"
                value={newJournalEntry.description}
                onChange={(e) => setNewJournalEntry(prev => ({ ...prev, description: e.target.value }))}
              />
            </Grid>
            
            <Grid item xs={12}>
              <Divider sx={{ my: 2 }} />
              <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                <Typography variant="h6">Journal Items</Typography>
                <Button startIcon={<AddIcon />} onClick={handleAddJournalItem}>
                  Add Item
                </Button>
              </Box>
              
              {newJournalEntry.items.map((item, index) => (
                <Box key={index} sx={{ mb: 2, p: 2, border: 1, borderColor: 'divider', borderRadius: 1 }}>
                  <Grid container spacing={2} alignItems="center">
                    <Grid item xs={12} md={4}>
                      <Autocomplete
                        options={accounts || []}
                        getOptionLabel={(option) => `${option.code} - ${option.name}`}
                        value={accounts?.find(a => a.id === item.accountId) || null}
                        onChange={(event, newValue) => {
                          handleJournalItemChange(index, 'accountId', newValue?.id || '');
                        }}
                        renderInput={(params) => (
                          <TextField {...params} label="Account" fullWidth />
                        )}
                      />
                    </Grid>
                    <Grid item xs={12} md={3}>
                      <TextField
                        fullWidth
                        type="number"
                        label="Debit"
                        value={item.debit}
                        onChange={(e) => handleJournalItemChange(index, 'debit', parseFloat(e.target.value) || 0)}
                      />
                    </Grid>
                    <Grid item xs={12} md={3}>
                      <TextField
                        fullWidth
                        type="number"
                        label="Credit"
                        value={item.credit}
                        onChange={(e) => handleJournalItemChange(index, 'credit', parseFloat(e.target.value) || 0)}
                      />
                    </Grid>
                    <Grid item xs={12} md={2}>
                      <IconButton onClick={() => {
                        setNewJournalEntry(prev => ({
                          ...prev,
                          items: prev.items.filter((_, i) => i !== index)
                        }));
                      }} color="error">
                        <DeleteIcon />
                      </IconButton>
                    </Grid>
                  </Grid>
                </Box>
              ))}
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setJournalDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleCreateJournalEntry}
            disabled={newJournalEntry.items.length === 0}
          >
            Create Entry
          </Button>
        </DialogActions>
      </Dialog>

      {/* Speed Dial */}
      <SpeedDial
        ariaLabel="Finance actions"
        sx={{ position: 'fixed', bottom: 16, right: 16 }}
        icon={<SpeedDialIcon />}
      >
        {actions.map((action) => (
          <SpeedDialAction
            key={action.name}
            icon={action.icon}
            tooltipTitle={action.name}
            onClick={action.action}
          />
        ))}
      </SpeedDial>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
      >
        <Alert severity={snackbar.severity} onClose={() => setSnackbar({ ...snackbar, open: false })}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default FinanceManager;