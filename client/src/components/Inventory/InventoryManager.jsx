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
  LinearProgress,
  Badge,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Accordion,
  AccordionSummary,
  AccordionDetails
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Inventory as InventoryIcon,
  Warning as WarningIcon,
  Error as ErrorIcon,
  CheckCircle as CheckCircleIcon,
  Search as SearchIcon,
  FilterList as FilterIcon,
  Download as DownloadIcon,
  Refresh as RefreshIcon,
  LocalShipping as ShippingIcon,
  Assessment as AssessmentIcon,
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  ExpandMore,
  Visibility as ViewIcon,
  Print as PrintIcon
} from '@mui/icons-material';
import { useInventory } from '../../hooks/useInventory';
import { useProducts } from '../../hooks/useProducts';
import { useSocket } from '../../hooks/useSocket';
import { useSettings } from '../../hooks/useSettings';

const InventoryManager = () => {
  const { inventory, loading, error, updateStock, getAlerts } = useInventory();
  const { products } = useProducts();
  const { socket } = useSocket();
  const { settings } = useSettings();
  
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  
  const [adjustDialogOpen, setAdjustDialogOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
  
  const [stockAdjustment, setStockAdjustment] = useState({
    productId: '',
    quantity: 0,
    type: 'ADJUSTMENT',
    reason: ''
  });

  const [alerts, setAlerts] = useState({
    lowStock: [],
    outOfStock: [],
    reorderPoint: []
  });

  useEffect(() => {
    if (socket) {
      socket.on('stockUpdated', (data) => {
        setSnackbar({
          open: true,
          message: `Stock updated for ${data.productName}`,
          severity: 'info'
        });
      });

      socket.on('lowStockAlert', (data) => {
        setSnackbar({
          open: true,
          message: `Low stock alert: ${data.productName} (${data.quantity} remaining)`,
          severity: 'warning'
        });
      });
    }

    return () => {
      if (socket) {
        socket.off('stockUpdated');
        socket.off('lowStockAlert');
      }
    };
  }, [socket]);

  useEffect(() => {
    const loadAlerts = async () => {
      try {
        const alertData = await getAlerts();
        setAlerts(alertData);
      } catch (error) {
        console.error('Failed to load alerts:', error);
      }
    };
    loadAlerts();
  }, [getAlerts]);

  const handleStockAdjustment = async () => {
    try {
      await updateStock(stockAdjustment);
      setAdjustDialogOpen(false);
      setStockAdjustment({ productId: '', quantity: 0, type: 'ADJUSTMENT', reason: '' });
      setSnackbar({
        open: true,
        message: 'Stock adjustment applied successfully',
        severity: 'success'
      });
    } catch (error) {
      setSnackbar({
        open: true,
        message: 'Failed to adjust stock',
        severity: 'error'
      });
    }
  };

  const filteredInventory = inventory?.filter(item => {
    const matchesSearch = item.product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         item.product.sku?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = categoryFilter === 'all' || item.product.category?.id === categoryFilter;
    const matchesStatus = statusFilter === 'all' || 
                         (statusFilter === 'low' && item.quantity <= (settings?.inventory?.lowStockThreshold || 10)) ||
                         (statusFilter === 'out' && item.quantity === 0) ||
                         (statusFilter === 'normal' && item.quantity > (settings?.inventory?.lowStockThreshold || 10));
    
    return matchesSearch && matchesCategory && matchesStatus;
  }) || [];

  const getStockStatus = (quantity) => {
    const threshold = settings?.inventory?.lowStockThreshold || 10;
    if (quantity === 0) return { status: 'Out of Stock', color: 'error', icon: <ErrorIcon /> };
    if (quantity <= threshold) return { status: 'Low Stock', color: 'warning', icon: <WarningIcon /> };
    return { status: 'In Stock', color: 'success', icon: <CheckCircleIcon /> };
  };

  const getStockPercentage = (quantity, maxQuantity) => {
    if (!maxQuantity) return 0;
    return Math.min((quantity / maxQuantity) * 100, 100);
  };

  const calculateTotalValue = () => {
    return filteredInventory.reduce((sum, item) => {
      return sum + (item.quantity * item.product.costPrice);
    }, 0);
  };

  const actions = [
    { icon: <AddIcon />, name: 'Adjust Stock', action: () => setAdjustDialogOpen(true) },
    { icon: <AssessmentIcon />, name: 'Valuation Report', action: () => console.log('Valuation') },
    { icon: <DownloadIcon />, name: 'Export', action: () => console.log('Export') },
    { icon: <RefreshIcon />, name: 'Refresh', action: () => window.location.reload() }
  ];

  return (
    <Box>
      {/* Header */}
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4" component="h1">
          Inventory Management
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setAdjustDialogOpen(true)}
        >
          Adjust Stock
        </Button>
      </Box>

      {/* Summary Cards */}
      <Grid container spacing={3} mb={3}>
        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" justifyContent="space-between">
                <Box>
                  <Typography color="textSecondary" gutterBottom>
                    Total Products
                  </Typography>
                  <Typography variant="h4">
                    {inventory?.length || 0}
                  </Typography>
                </Box>
                <InventoryIcon color="primary" sx={{ fontSize: 40 }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" justifyContent="space-between">
                <Box>
                  <Typography color="textSecondary" gutterBottom>
                    Low Stock Items
                  </Typography>
                  <Typography variant="h4" color="warning.main">
                    {alerts.lowStock?.length || 0}
                  </Typography>
                </Box>
                <Badge badgeContent={alerts.lowStock?.length || 0} color="warning">
                  <WarningIcon color="warning" sx={{ fontSize: 40 }} />
                </Badge>
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" justifyContent="space-between">
                <Box>
                  <Typography color="textSecondary" gutterBottom>
                    Out of Stock
                  </Typography>
                  <Typography variant="h4" color="error.main">
                    {alerts.outOfStock?.length || 0}
                  </Typography>
                </Box>
                <Badge badgeContent={alerts.outOfStock?.length || 0} color="error">
                  <ErrorIcon color="error" sx={{ fontSize: 40 }} />
                </Badge>
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" justifyContent="space-between">
                <Box>
                  <Typography color="textSecondary" gutterBottom>
                    Total Value
                  </Typography>
                  <Typography variant="h4" color="success.main">
                    ${calculateTotalValue().toFixed(2)}
                  </Typography>
                </Box>
                <TrendingUpIcon color="success" sx={{ fontSize: 40 }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Alerts Section */}
      {(alerts.lowStock?.length > 0 || alerts.outOfStock?.length > 0) && (
        <Paper sx={{ p: 2, mb: 3 }}>
          <Typography variant="h6" gutterBottom>
            Stock Alerts
          </Typography>
          <Grid container spacing={2}>
            {alerts.outOfStock?.length > 0 && (
              <Grid item xs={12} md={6}>
                <Alert severity="error" icon={<ErrorIcon />}>
                  <Typography variant="subtitle2">
                    {alerts.outOfStock.length} products out of stock
                  </Typography>
                </Alert>
              </Grid>
            )}
            {alerts.lowStock?.length > 0 && (
              <Grid item xs={12} md={6}>
                <Alert severity="warning" icon={<WarningIcon />}>
                  <Typography variant="subtitle2">
                    {alerts.lowStock.length} products low on stock
                  </Typography>
                </Alert>
              </Grid>
            )}
          </Grid>
        </Paper>
      )}

      {/* Filters */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} md={4}>
            <TextField
              fullWidth
              placeholder="Search products..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              InputProps={{
                startAdornment: <SearchIcon sx={{ mr: 1, color: 'text.secondary' }} />
              }}
            />
          </Grid>
          <Grid item xs={12} md={2}>
            <FormControl fullWidth>
              <InputLabel>Category</InputLabel>
              <Select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
              >
                <MenuItem value="all">All Categories</MenuItem>
                {/* Add category options */}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} md={2}>
            <FormControl fullWidth>
              <InputLabel>Status</InputLabel>
              <Select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <MenuItem value="all">All Status</MenuItem>
                <MenuItem value="normal">Normal</MenuItem>
                <MenuItem value="low">Low Stock</MenuItem>
                <MenuItem value="out">Out of Stock</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} md={2}>
            <Button
              variant="outlined"
              startIcon={<FilterIcon />}
              onClick={() => {
                setSearchTerm('');
                setCategoryFilter('all');
                setStatusFilter('all');
              }}
            >
              Clear Filters
            </Button>
          </Grid>
        </Grid>
      </Paper>

      {/* Inventory Table */}
      <Paper>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Product</TableCell>
                <TableCell>SKU</TableCell>
                <TableCell>Category</TableCell>
                <TableCell>Current Stock</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Value</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredInventory
                .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
                .map((item) => {
                  const stockStatus = getStockStatus(item.quantity);
                  const stockPercentage = getStockPercentage(item.quantity, item.product.maxStock || 100);
                  
                  return (
                    <TableRow key={item.product.id}>
                      <TableCell>
                        <Box>
                          <Typography variant="subtitle2" fontWeight="bold">
                            {item.product.name}
                          </Typography>
                          <Typography variant="caption" color="textSecondary">
                            {item.product.description}
                          </Typography>
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">
                          {item.product.sku || 'N/A'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={item.product.category?.name || 'Uncategorized'}
                          size="small"
                          variant="outlined"
                        />
                      </TableCell>
                      <TableCell>
                        <Box>
                          <Typography variant="body2" fontWeight="bold">
                            {item.quantity}
                          </Typography>
                          <LinearProgress
                            variant="determinate"
                            value={stockPercentage}
                            color={stockStatus.color}
                            sx={{ height: 4, borderRadius: 2 }}
                          />
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Chip
                          icon={stockStatus.icon}
                          label={stockStatus.status}
                          color={stockStatus.color}
                          size="small"
                        />
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" fontWeight="bold">
                          ${(item.quantity * item.product.costPrice).toFixed(2)}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Box display="flex" gap={1}>
                          <Tooltip title="View Details">
                            <IconButton size="small" onClick={() => setSelectedProduct(item.product)}>
                              <ViewIcon />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Adjust Stock">
                            <IconButton 
                              size="small" 
                              onClick={() => {
                                setSelectedProduct(item.product);
                                setStockAdjustment(prev => ({ ...prev, productId: item.product.id }));
                                setAdjustDialogOpen(true);
                              }}
                            >
                              <EditIcon />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Print Label">
                            <IconButton size="small">
                              <PrintIcon />
                            </IconButton>
                          </Tooltip>
                        </Box>
                      </TableCell>
                    </TableRow>
                  );
                })}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination
          rowsPerPageOptions={[5, 10, 25]}
          component="div"
          count={filteredInventory.length}
          rowsPerPage={rowsPerPage}
          page={page}
          onPageChange={(event, newPage) => setPage(newPage)}
          onRowsPerPageChange={(event) => {
            setRowsPerPage(parseInt(event.target.value, 10));
            setPage(0);
          }}
        />
      </Paper>

      {/* Stock Adjustment Dialog */}
      <Dialog
        open={adjustDialogOpen}
        onClose={() => setAdjustDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Adjust Stock</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12}>
              <Autocomplete
                options={products || []}
                getOptionLabel={(option) => option.name}
                value={products?.find(p => p.id === stockAdjustment.productId) || null}
                onChange={(event, newValue) => {
                  setStockAdjustment(prev => ({ ...prev, productId: newValue?.id || '' }));
                }}
                renderInput={(params) => (
                  <TextField {...params} label="Product" fullWidth />
                )}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <FormControl fullWidth>
                <InputLabel>Adjustment Type</InputLabel>
                <Select
                  value={stockAdjustment.type}
                  onChange={(e) => setStockAdjustment(prev => ({ ...prev, type: e.target.value }))}
                >
                  <MenuItem value="ADJUSTMENT">Manual Adjustment</MenuItem>
                  <MenuItem value="PURCHASE">Purchase</MenuItem>
                  <MenuItem value="SALE">Sale</MenuItem>
                  <MenuItem value="RETURN">Return</MenuItem>
                  <MenuItem value="DAMAGED">Damaged</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                type="number"
                label="Quantity"
                value={stockAdjustment.quantity}
                onChange={(e) => setStockAdjustment(prev => ({ ...prev, quantity: parseInt(e.target.value) }))}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                multiline
                rows={3}
                label="Reason"
                value={stockAdjustment.reason}
                onChange={(e) => setStockAdjustment(prev => ({ ...prev, reason: e.target.value }))}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAdjustDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleStockAdjustment}
            disabled={!stockAdjustment.productId || stockAdjustment.quantity === 0}
          >
            Apply Adjustment
          </Button>
        </DialogActions>
      </Dialog>

      {/* Speed Dial */}
      <SpeedDial
        ariaLabel="Inventory actions"
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

export default InventoryManager;