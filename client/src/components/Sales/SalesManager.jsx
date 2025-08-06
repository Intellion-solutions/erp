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
  Fab,
  SpeedDial,
  SpeedDialAction,
  SpeedDialIcon
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Receipt as ReceiptIcon,
  Print as PrintIcon,
  Email as EmailIcon,
  Visibility as ViewIcon,
  Search as SearchIcon,
  FilterList as FilterIcon,
  Download as DownloadIcon,
  Refresh as RefreshIcon,
  Payment as PaymentIcon,
  CreditCard as CreditCardIcon,
  LocalShipping as ShippingIcon
} from '@mui/icons-material';
import { useSales } from '../../hooks/useSales';
import { useCustomers } from '../../hooks/useCustomers';
import { useProducts } from '../../hooks/useProducts';
import { useSocket } from '../../hooks/useSocket';

const SalesManager = () => {
  const { sales, loading, error, createSale, updateSale, deleteSale } = useSales();
  const { customers } = useCustomers();
  const { products } = useProducts();
  const { socket } = useSocket();
  
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState({ start: '', end: '' });
  
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [selectedSale, setSelectedSale] = useState(null);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
  
  const [newSale, setNewSale] = useState({
    customerId: '',
    items: [],
    paymentMethod: 'CASH',
    notes: ''
  });

  useEffect(() => {
    if (socket) {
      socket.on('saleCreated', (sale) => {
        setSnackbar({
          open: true,
          message: `Sale ${sale.saleNumber} created successfully`,
          severity: 'success'
        });
      });

      socket.on('saleStatusUpdated', (data) => {
        setSnackbar({
          open: true,
          message: `Sale ${data.saleId} status updated to ${data.status}`,
          severity: 'info'
        });
      });
    }

    return () => {
      if (socket) {
        socket.off('saleCreated');
        socket.off('saleStatusUpdated');
      }
    };
  }, [socket]);

  const handleCreateSale = async () => {
    try {
      await createSale(newSale);
      setCreateDialogOpen(false);
      setNewSale({ customerId: '', items: [], paymentMethod: 'CASH', notes: '' });
    } catch (error) {
      setSnackbar({
        open: true,
        message: 'Failed to create sale',
        severity: 'error'
      });
    }
  };

  const handleAddItem = () => {
    setNewSale(prev => ({
      ...prev,
      items: [...prev.items, { productId: '', quantity: 1, unitPrice: 0 }]
    }));
  };

  const handleItemChange = (index, field, value) => {
    setNewSale(prev => ({
      ...prev,
      items: prev.items.map((item, i) => 
        i === index ? { ...item, [field]: value } : item
      )
    }));
  };

  const handleRemoveItem = (index) => {
    setNewSale(prev => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index)
    }));
  };

  const filteredSales = sales?.filter(sale => {
    const matchesSearch = sale.saleNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         sale.customer?.name?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || sale.paymentStatus === statusFilter;
    const matchesDate = !dateFilter.start || !dateFilter.end || 
                       (new Date(sale.createdAt) >= new Date(dateFilter.start) &&
                        new Date(sale.createdAt) <= new Date(dateFilter.end));
    
    return matchesSearch && matchesStatus && matchesDate;
  }) || [];

  const getStatusColor = (status) => {
    switch (status) {
      case 'COMPLETED': return 'success';
      case 'PENDING': return 'warning';
      case 'FAILED': return 'error';
      case 'CANCELLED': return 'default';
      default: return 'default';
    }
  };

  const getPaymentMethodIcon = (method) => {
    switch (method) {
      case 'CASH': return '💵';
      case 'CARD': return <CreditCardIcon />;
      case 'BANK_TRANSFER': return '🏦';
      case 'MOBILE_MONEY': return '📱';
      case 'CHEQUE': return '📄';
      case 'CREDIT': return '💳';
      default: return '💰';
    }
  };

  const calculateTotal = (items) => {
    return items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);
  };

  const actions = [
    { icon: <AddIcon />, name: 'Create Sale', action: () => setCreateDialogOpen(true) },
    { icon: <DownloadIcon />, name: 'Export', action: () => console.log('Export') },
    { icon: <RefreshIcon />, name: 'Refresh', action: () => window.location.reload() }
  ];

  return (
    <Box>
      {/* Header */}
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4" component="h1">
          Sales Management
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setCreateDialogOpen(true)}
        >
          New Sale
        </Button>
      </Box>

      {/* Filters */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} md={4}>
            <TextField
              fullWidth
              placeholder="Search sales..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              InputProps={{
                startAdornment: <SearchIcon sx={{ mr: 1, color: 'text.secondary' }} />
              }}
            />
          </Grid>
          <Grid item xs={12} md={2}>
            <FormControl fullWidth>
              <InputLabel>Status</InputLabel>
              <Select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <MenuItem value="all">All Status</MenuItem>
                <MenuItem value="PENDING">Pending</MenuItem>
                <MenuItem value="COMPLETED">Completed</MenuItem>
                <MenuItem value="FAILED">Failed</MenuItem>
                <MenuItem value="CANCELLED">Cancelled</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} md={2}>
            <TextField
              fullWidth
              type="date"
              label="From Date"
              value={dateFilter.start}
              onChange={(e) => setDateFilter(prev => ({ ...prev, start: e.target.value }))}
              InputLabelProps={{ shrink: true }}
            />
          </Grid>
          <Grid item xs={12} md={2}>
            <TextField
              fullWidth
              type="date"
              label="To Date"
              value={dateFilter.end}
              onChange={(e) => setDateFilter(prev => ({ ...prev, end: e.target.value }))}
              InputLabelProps={{ shrink: true }}
            />
          </Grid>
          <Grid item xs={12} md={2}>
            <Button
              variant="outlined"
              startIcon={<FilterIcon />}
              onClick={() => {
                setSearchTerm('');
                setStatusFilter('all');
                setDateFilter({ start: '', end: '' });
              }}
            >
              Clear Filters
            </Button>
          </Grid>
        </Grid>
      </Paper>

      {/* Sales Table */}
      <Paper>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Sale Number</TableCell>
                <TableCell>Customer</TableCell>
                <TableCell>Date</TableCell>
                <TableCell>Total</TableCell>
                <TableCell>Payment Method</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredSales
                .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
                .map((sale) => (
                  <TableRow key={sale.id}>
                    <TableCell>
                      <Typography variant="subtitle2" fontWeight="bold">
                        {sale.saleNumber}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      {sale.customer?.name || 'Walk-in Customer'}
                    </TableCell>
                    <TableCell>
                      {new Date(sale.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <Typography variant="subtitle2" fontWeight="bold">
                        ${sale.total.toFixed(2)}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Box display="flex" alignItems="center" gap={1}>
                        {getPaymentMethodIcon(sale.paymentMethod)}
                        <Typography variant="body2">
                          {sale.paymentMethod.replace('_', ' ')}
                        </Typography>
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={sale.paymentStatus}
                        color={getStatusColor(sale.paymentStatus)}
                        size="small"
                      />
                    </TableCell>
                    <TableCell>
                      <Box display="flex" gap={1}>
                        <Tooltip title="View Details">
                          <IconButton size="small" onClick={() => setSelectedSale(sale)}>
                            <ViewIcon />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Print Invoice">
                          <IconButton size="small">
                            <PrintIcon />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Send Email">
                          <IconButton size="small">
                            <EmailIcon />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Add Payment">
                          <IconButton size="small">
                            <PaymentIcon />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination
          rowsPerPageOptions={[5, 10, 25]}
          component="div"
          count={filteredSales.length}
          rowsPerPage={rowsPerPage}
          page={page}
          onPageChange={(event, newPage) => setPage(newPage)}
          onRowsPerPageChange={(event) => {
            setRowsPerPage(parseInt(event.target.value, 10));
            setPage(0);
          }}
        />
      </Paper>

      {/* Create Sale Dialog */}
      <Dialog
        open={createDialogOpen}
        onClose={() => setCreateDialogOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>Create New Sale</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12} md={6}>
              <Autocomplete
                options={customers || []}
                getOptionLabel={(option) => option.name}
                value={customers?.find(c => c.id === newSale.customerId) || null}
                onChange={(event, newValue) => {
                  setNewSale(prev => ({ ...prev, customerId: newValue?.id || '' }));
                }}
                renderInput={(params) => (
                  <TextField {...params} label="Customer" fullWidth />
                )}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <FormControl fullWidth>
                <InputLabel>Payment Method</InputLabel>
                <Select
                  value={newSale.paymentMethod}
                  onChange={(e) => setNewSale(prev => ({ ...prev, paymentMethod: e.target.value }))}
                >
                  <MenuItem value="CASH">Cash</MenuItem>
                  <MenuItem value="CARD">Card</MenuItem>
                  <MenuItem value="BANK_TRANSFER">Bank Transfer</MenuItem>
                  <MenuItem value="MOBILE_MONEY">Mobile Money</MenuItem>
                  <MenuItem value="CHEQUE">Cheque</MenuItem>
                  <MenuItem value="CREDIT">Credit</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            
            <Grid item xs={12}>
              <Divider sx={{ my: 2 }} />
              <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                <Typography variant="h6">Items</Typography>
                <Button startIcon={<AddIcon />} onClick={handleAddItem}>
                  Add Item
                </Button>
              </Box>
              
              {newSale.items.map((item, index) => (
                <Box key={index} sx={{ mb: 2, p: 2, border: 1, borderColor: 'divider', borderRadius: 1 }}>
                  <Grid container spacing={2} alignItems="center">
                    <Grid item xs={12} md={4}>
                      <Autocomplete
                        options={products || []}
                        getOptionLabel={(option) => option.name}
                        value={products?.find(p => p.id === item.productId) || null}
                        onChange={(event, newValue) => {
                          handleItemChange(index, 'productId', newValue?.id || '');
                          if (newValue) {
                            handleItemChange(index, 'unitPrice', newValue.sellingPrice);
                          }
                        }}
                        renderInput={(params) => (
                          <TextField {...params} label="Product" fullWidth />
                        )}
                      />
                    </Grid>
                    <Grid item xs={12} md={2}>
                      <TextField
                        fullWidth
                        type="number"
                        label="Quantity"
                        value={item.quantity}
                        onChange={(e) => handleItemChange(index, 'quantity', parseInt(e.target.value))}
                      />
                    </Grid>
                    <Grid item xs={12} md={2}>
                      <TextField
                        fullWidth
                        type="number"
                        label="Unit Price"
                        value={item.unitPrice}
                        onChange={(e) => handleItemChange(index, 'unitPrice', parseFloat(e.target.value))}
                      />
                    </Grid>
                    <Grid item xs={12} md={2}>
                      <Typography variant="subtitle1" fontWeight="bold">
                        ${(item.quantity * item.unitPrice).toFixed(2)}
                      </Typography>
                    </Grid>
                    <Grid item xs={12} md={2}>
                      <IconButton onClick={() => handleRemoveItem(index)} color="error">
                        <DeleteIcon />
                      </IconButton>
                    </Grid>
                  </Grid>
                </Box>
              ))}
              
              <Box sx={{ mt: 2, p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
                <Typography variant="h6" textAlign="right">
                  Total: ${calculateTotal(newSale.items).toFixed(2)}
                </Typography>
              </Box>
            </Grid>
            
            <Grid item xs={12}>
              <TextField
                fullWidth
                multiline
                rows={3}
                label="Notes"
                value={newSale.notes}
                onChange={(e) => setNewSale(prev => ({ ...prev, notes: e.target.value }))}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleCreateSale}
            disabled={newSale.items.length === 0}
          >
            Create Sale
          </Button>
        </DialogActions>
      </Dialog>

      {/* Speed Dial */}
      <SpeedDial
        ariaLabel="Sales actions"
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

export default SalesManager;