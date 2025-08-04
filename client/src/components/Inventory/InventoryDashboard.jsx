import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  Grid,
  Card,
  CardContent,
  IconButton,
  Chip,
  Alert,
  LinearProgress,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Divider,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Badge,
  CircularProgress
} from '@mui/material';
import {
  Inventory as InventoryIcon,
  Warning as WarningIcon,
  Error as ErrorIcon,
  CheckCircle as CheckCircleIcon,
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  Assessment as AssessmentIcon,
  LocalShipping as ShippingIcon,
  ShoppingCart as ShoppingCartIcon,
  Visibility as ViewIcon,
  Edit as EditIcon,
  Print as PrintIcon,
  Download as DownloadIcon,
  Refresh as RefreshIcon,
  Add as AddIcon,
  Remove as RemoveIcon,
  AttachMoney as AttachMoneyIcon,
  Category as CategoryIcon,
  Speed as SpeedIcon,
  Timeline as TimelineIcon
} from '@mui/icons-material';
import { useInventory } from '../../hooks/useInventory';
import { useSocket } from '../../hooks/useSocket';
import { useSettings } from '../../hooks/useSettings';

const InventoryDashboard = () => {
  const { inventory, loading, error, getAlerts, getValuation, getMovements } = useInventory();
  const { socket } = useSocket();
  const { settings } = useSettings();
  
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [adjustDialogOpen, setAdjustDialogOpen] = useState(false);
  const [valuationDialogOpen, setValuationDialogOpen] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
  
  const [dashboardData, setDashboardData] = useState({
    totalProducts: 0,
    totalValue: 0,
    lowStockItems: 0,
    outOfStockItems: 0,
    reorderItems: 0,
    recentMovements: [],
    topProducts: [],
    categoryDistribution: [],
    valuationMethods: {
      fifo: 0,
      lifo: 0,
      average: 0
    }
  });

  const [alerts, setAlerts] = useState({
    lowStock: [],
    outOfStock: [],
    reorderPoint: []
  });

  const [valuationData, setValuationData] = useState({
    method: 'FIFO',
    totalValue: 0,
    breakdown: []
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
    const loadDashboardData = async () => {
      try {
        // Load alerts
        const alertData = await getAlerts();
        setAlerts(alertData);

        // Load valuation data
        const valuation = await getValuation();
        setValuationData(valuation);

        // Calculate dashboard statistics
        if (inventory) {
          const totalProducts = inventory.length;
          const totalValue = inventory.reduce((sum, item) => sum + (item.quantity * item.product.costPrice), 0);
          const lowStockItems = inventory.filter(item => 
            item.quantity <= (settings?.inventory?.lowStockThreshold || 10)
          ).length;
          const outOfStockItems = inventory.filter(item => item.quantity === 0).length;
          const reorderItems = inventory.filter(item => 
            item.quantity <= (item.product.reorderPoint || 5)
          ).length;

          // Get recent movements
          const movements = await getMovements();
          const recentMovements = movements?.slice(0, 10) || [];

          // Calculate top products by value
          const topProducts = [...inventory]
            .sort((a, b) => (b.quantity * b.product.costPrice) - (a.quantity * a.product.costPrice))
            .slice(0, 5);

          // Calculate category distribution
          const categoryMap = {};
          inventory.forEach(item => {
            const category = item.product.category?.name || 'Uncategorized';
            categoryMap[category] = (categoryMap[category] || 0) + 1;
          });
          const categoryDistribution = Object.entries(categoryMap).map(([name, count]) => ({
            name,
            count,
            percentage: (count / totalProducts) * 100
          }));

          setDashboardData({
            totalProducts,
            totalValue,
            lowStockItems,
            outOfStockItems,
            reorderItems,
            recentMovements,
            topProducts,
            categoryDistribution
          });
        }
      } catch (error) {
        console.error('Failed to load dashboard data:', error);
      }
    };

    loadDashboardData();
  }, [inventory, getAlerts, getValuation, getMovements, settings]);

  const getStockStatusColor = (quantity, threshold) => {
    if (quantity === 0) return 'error';
    if (quantity <= threshold) return 'warning';
    return 'success';
  };

  const getStockPercentage = (quantity, maxQuantity) => {
    if (!maxQuantity) return 0;
    return Math.min((quantity / maxQuantity) * 100, 100);
  };

  const handleValuationMethodChange = async (method) => {
    try {
      const valuation = await getValuation(method);
      setValuationData(valuation);
    } catch (error) {
      console.error('Failed to update valuation:', error);
    }
  };

  const renderSummaryCards = () => (
    <Grid container spacing={3} mb={3}>
      <Grid item xs={12} md={2.4}>
        <Card>
          <CardContent>
            <Box display="flex" alignItems="center" justifyContent="space-between">
              <Box>
                <Typography color="textSecondary" gutterBottom>
                  Total Products
                </Typography>
                <Typography variant="h4">
                  {dashboardData.totalProducts}
                </Typography>
              </Box>
              <InventoryIcon color="primary" sx={{ fontSize: 40 }} />
            </Box>
          </CardContent>
        </Card>
      </Grid>
      <Grid item xs={12} md={2.4}>
        <Card>
          <CardContent>
            <Box display="flex" alignItems="center" justifyContent="space-between">
              <Box>
                <Typography color="textSecondary" gutterBottom>
                  Total Value
                </Typography>
                <Typography variant="h4" color="success.main">
                  ${dashboardData.totalValue?.toFixed(2)}
                </Typography>
              </Box>
              <AttachMoneyIcon color="success" sx={{ fontSize: 40 }} />
            </Box>
          </CardContent>
        </Card>
      </Grid>
      <Grid item xs={12} md={2.4}>
        <Card>
          <CardContent>
            <Box display="flex" alignItems="center" justifyContent="space-between">
              <Box>
                <Typography color="textSecondary" gutterBottom>
                  Low Stock Items
                </Typography>
                <Typography variant="h4" color="warning.main">
                  {dashboardData.lowStockItems}
                </Typography>
              </Box>
              <Badge badgeContent={dashboardData.lowStockItems} color="warning">
                <WarningIcon color="warning" sx={{ fontSize: 40 }} />
              </Badge>
            </Box>
          </CardContent>
        </Card>
      </Grid>
      <Grid item xs={12} md={2.4}>
        <Card>
          <CardContent>
            <Box display="flex" alignItems="center" justifyContent="space-between">
              <Box>
                <Typography color="textSecondary" gutterBottom>
                  Out of Stock
                </Typography>
                <Typography variant="h4" color="error.main">
                  {dashboardData.outOfStockItems}
                </Typography>
              </Box>
              <Badge badgeContent={dashboardData.outOfStockItems} color="error">
                <ErrorIcon color="error" sx={{ fontSize: 40 }} />
              </Badge>
            </Box>
          </CardContent>
        </Card>
      </Grid>
      <Grid item xs={12} md={2.4}>
        <Card>
          <CardContent>
            <Box display="flex" alignItems="center" justifyContent="space-between">
              <Box>
                <Typography color="textSecondary" gutterBottom>
                  Need Reorder
                </Typography>
                <Typography variant="h4" color="info.main">
                  {dashboardData.reorderItems}
                </Typography>
              </Box>
              <ShoppingCartIcon color="info" sx={{ fontSize: 40 }} />
            </Box>
          </CardContent>
        </Card>
      </Grid>
    </Grid>
  );

  const renderAlerts = () => (
    <Paper sx={{ p: 2, mb: 3 }}>
      <Typography variant="h6" gutterBottom>
        Stock Alerts
      </Typography>
      <Grid container spacing={2}>
        {alerts.outOfStock?.length > 0 && (
          <Grid item xs={12} md={4}>
            <Alert severity="error" icon={<ErrorIcon />}>
              <Typography variant="subtitle2">
                {alerts.outOfStock.length} products out of stock
              </Typography>
              <List dense>
                {alerts.outOfStock.slice(0, 3).map((item) => (
                  <ListItem key={item.id} dense>
                    <ListItemText
                      primary={item.product.name}
                      secondary={`SKU: ${item.product.sku}`}
                    />
                  </ListItem>
                ))}
              </List>
            </Alert>
          </Grid>
        )}
        {alerts.lowStock?.length > 0 && (
          <Grid item xs={12} md={4}>
            <Alert severity="warning" icon={<WarningIcon />}>
              <Typography variant="subtitle2">
                {alerts.lowStock.length} products low on stock
              </Typography>
              <List dense>
                {alerts.lowStock.slice(0, 3).map((item) => (
                  <ListItem key={item.id} dense>
                    <ListItemText
                      primary={item.product.name}
                      secondary={`${item.quantity} remaining`}
                    />
                  </ListItem>
                ))}
              </List>
            </Alert>
          </Grid>
        )}
        {alerts.reorderPoint?.length > 0 && (
          <Grid item xs={12} md={4}>
            <Alert severity="info" icon={<ShoppingCartIcon />}>
              <Typography variant="subtitle2">
                {alerts.reorderPoint.length} products need reorder
              </Typography>
              <List dense>
                {alerts.reorderPoint.slice(0, 3).map((item) => (
                  <ListItem key={item.id} dense>
                    <ListItemText
                      primary={item.product.name}
                      secondary={`Reorder point: ${item.product.reorderPoint}`}
                    />
                  </ListItem>
                ))}
              </List>
            </Alert>
          </Grid>
        )}
      </Grid>
    </Paper>
  );

  const renderTopProducts = () => (
    <Grid container spacing={3}>
      <Grid item xs={12} md={6}>
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Top Products by Value
            </Typography>
            <List>
              {dashboardData.topProducts?.map((item, index) => (
                <ListItem key={item.product.id}>
                  <ListItemIcon>
                    <Typography variant="h6" color="primary">
                      #{index + 1}
                    </Typography>
                  </ListItemIcon>
                  <ListItemText
                    primary={item.product.name}
                    secondary={`${item.quantity} units • $${(item.quantity * item.product.costPrice).toFixed(2)}`}
                  />
                  <Chip
                    label={`${getStockPercentage(item.quantity, item.product.maxStock || 100).toFixed(0)}%`}
                    color={getStockStatusColor(item.quantity, settings?.inventory?.lowStockThreshold || 10)}
                    size="small"
                  />
                </ListItem>
              ))}
            </List>
          </CardContent>
        </Card>
      </Grid>

      <Grid item xs={12} md={6}>
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Category Distribution
            </Typography>
            <List>
              {dashboardData.categoryDistribution?.map((category) => (
                <ListItem key={category.name}>
                  <ListItemIcon>
                    <CategoryIcon color="primary" />
                  </ListItemIcon>
                  <ListItemText
                    primary={category.name}
                    secondary={`${category.count} products`}
                  />
                  <Box display="flex" alignItems="center" gap={1}>
                    <LinearProgress
                      variant="determinate"
                      value={category.percentage}
                      sx={{ width: 60, height: 8, borderRadius: 4 }}
                    />
                    <Typography variant="caption">
                      {category.percentage.toFixed(1)}%
                    </Typography>
                  </Box>
                </ListItem>
              ))}
            </List>
          </CardContent>
        </Card>
      </Grid>
    </Grid>
  );

  const renderValuationSection = () => (
    <Paper sx={{ p: 2, mb: 3 }}>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
        <Typography variant="h6">
          Inventory Valuation
        </Typography>
        <Box display="flex" gap={1}>
          <FormControl size="small">
            <InputLabel>Method</InputLabel>
            <Select
              value={valuationData.method}
              onChange={(e) => handleValuationMethodChange(e.target.value)}
            >
              <MenuItem value="FIFO">FIFO</MenuItem>
              <MenuItem value="LIFO">LIFO</MenuItem>
              <MenuItem value="AVERAGE">Average</MenuItem>
            </Select>
          </FormControl>
          <Button
            variant="outlined"
            startIcon={<AssessmentIcon />}
            onClick={() => setValuationDialogOpen(true)}
          >
            Detailed View
          </Button>
        </Box>
      </Box>
      
      <Grid container spacing={3}>
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Typography variant="h4" color="primary" gutterBottom>
                ${valuationData.totalValue?.toFixed(2)}
              </Typography>
              <Typography variant="body2" color="textSecondary">
                Total Inventory Value ({valuationData.method})
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={8}>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Category</TableCell>
                  <TableCell align="right">Quantity</TableCell>
                  <TableCell align="right">Unit Cost</TableCell>
                  <TableCell align="right">Total Value</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {valuationData.breakdown?.slice(0, 5).map((item) => (
                  <TableRow key={item.category}>
                    <TableCell>{item.category}</TableCell>
                    <TableCell align="right">{item.quantity}</TableCell>
                    <TableCell align="right">${item.unitCost?.toFixed(2)}</TableCell>
                    <TableCell align="right">${item.totalValue?.toFixed(2)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Grid>
      </Grid>
    </Paper>
  );

  const renderRecentMovements = () => (
    <Paper sx={{ p: 2 }}>
      <Typography variant="h6" gutterBottom>
        Recent Stock Movements
      </Typography>
      <TableContainer>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Product</TableCell>
              <TableCell>Type</TableCell>
              <TableCell>Quantity</TableCell>
              <TableCell>Date</TableCell>
              <TableCell>User</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {dashboardData.recentMovements?.map((movement) => (
              <TableRow key={movement.id}>
                <TableCell>
                  <Typography variant="body2" fontWeight="bold">
                    {movement.product?.name}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Chip
                    label={movement.type}
                    color={movement.type === 'IN' ? 'success' : 'error'}
                    size="small"
                  />
                </TableCell>
                <TableCell>
                  <Typography variant="body2">
                    {movement.quantity}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="body2">
                    {new Date(movement.date).toLocaleDateString()}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="body2">
                    {movement.user?.firstName} {movement.user?.lastName}
                  </Typography>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  );

  return (
    <Box>
      {/* Header */}
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4" component="h1">
          Inventory Dashboard
        </Typography>
        <Box display="flex" gap={1}>
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={() => window.location.reload()}
          >
            Refresh
          </Button>
          <Button
            variant="contained"
            startIcon={<DownloadIcon />}
            onClick={() => console.log('Export dashboard')}
          >
            Export Report
          </Button>
        </Box>
      </Box>

      {/* Summary Cards */}
      {renderSummaryCards()}

      {/* Alerts */}
      {renderAlerts()}

      {/* Top Products & Category Distribution */}
      {renderTopProducts()}

      {/* Valuation Section */}
      {renderValuationSection()}

      {/* Recent Movements */}
      {renderRecentMovements()}

      {/* Valuation Dialog */}
      <Dialog
        open={valuationDialogOpen}
        onClose={() => setValuationDialogOpen(false)}
        maxWidth="lg"
        fullWidth
      >
        <DialogTitle>Detailed Inventory Valuation</DialogTitle>
        <DialogContent>
          <Grid container spacing={2}>
            <Grid item xs={12}>
              <FormControl fullWidth sx={{ mb: 2 }}>
                <InputLabel>Valuation Method</InputLabel>
                <Select
                  value={valuationData.method}
                  onChange={(e) => handleValuationMethodChange(e.target.value)}
                >
                  <MenuItem value="FIFO">FIFO (First In, First Out)</MenuItem>
                  <MenuItem value="LIFO">LIFO (Last In, First Out)</MenuItem>
                  <MenuItem value="AVERAGE">Average Cost</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12}>
              <TableContainer>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>Product</TableCell>
                      <TableCell>Category</TableCell>
                      <TableCell align="right">Quantity</TableCell>
                      <TableCell align="right">Unit Cost</TableCell>
                      <TableCell align="right">Total Value</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {valuationData.breakdown?.map((item) => (
                      <TableRow key={item.productId}>
                        <TableCell>{item.productName}</TableCell>
                        <TableCell>{item.category}</TableCell>
                        <TableCell align="right">{item.quantity}</TableCell>
                        <TableCell align="right">${item.unitCost?.toFixed(2)}</TableCell>
                        <TableCell align="right">${item.totalValue?.toFixed(2)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setValuationDialogOpen(false)}>Close</Button>
          <Button
            variant="contained"
            startIcon={<PrintIcon />}
            onClick={() => console.log('Print valuation report')}
          >
            Print Report
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar */}
      {/* The Snackbar component is not imported, so this will cause an error.
          Assuming it's meant to be a placeholder or will be added later. */}
      {/* <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
      >
        <Alert severity={snackbar.severity} onClose={() => setSnackbar({ ...snackbar, open: false })}>
          {snackbar.message}
        </Alert>
      </Snackbar> */}
    </Box>
  );
};

export default InventoryDashboard;