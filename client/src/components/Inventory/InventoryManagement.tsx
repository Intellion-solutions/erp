import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  TextField,
  Grid,
  Card,
  CardContent,
  IconButton,
  Chip,
  Menu,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Tabs,
  Tab,
  Alert,
  Badge,
  Tooltip,
  Fab,
  SpeedDial,
  SpeedDialAction,
  SpeedDialIcon
} from '@mui/material';
import {
  Add,
  Search,
  FilterList,
  Download,
  Upload,
  Inventory,
  Warning,
  TrendingUp,
  TrendingDown,
  QrCodeScanner,
  Edit,
  Delete,
  Visibility,
  MoreVert,
  Print,
  GetApp,
  CloudUpload,
  Analytics,
  Refresh,
  History,
  Category,
  LocalShipping
} from '@mui/icons-material';
import { DataGrid, GridColDef, GridActionsCellItem, GridToolbar } from '@mui/x-data-grid';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import toast from 'react-hot-toast';

import { productsApi, categoriesApi, suppliersApi } from '../../services/api';
import { useAuth } from '../../hooks/useAuth';
import { useSocket } from '../../hooks/useSocket';
import { Product, Category, Supplier } from '../../types';
import ProductDialog from './ProductDialog';
import StockAdjustmentDialog from './StockAdjustmentDialog';
import BulkOperationsDialog from './BulkOperationsDialog';
import InventoryAnalytics from './InventoryAnalytics';
import BarcodeScanner from '../POS/BarcodeScanner';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

const TabPanel: React.FC<TabPanelProps> = ({ children, value, index }) => (
  <div hidden={value !== index}>
    {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
  </div>
);

const InventoryManagement: React.FC = () => {
  const { user } = useAuth();
  const { socket } = useSocket();
  const queryClient = useQueryClient();

  // State
  const [tabValue, setTabValue] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [isProductDialogOpen, setIsProductDialogOpen] = useState(false);
  const [isStockDialogOpen, setIsStockDialogOpen] = useState(false);
  const [isBulkDialogOpen, setIsBulkDialogOpen] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [filters, setFilters] = useState({
    category: '',
    supplier: '',
    status: '',
    lowStock: false,
    outOfStock: false
  });
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

  // Queries
  const { data: productsData, isLoading, refetch } = useQuery(
    ['products', searchQuery, filters],
    () => productsApi.getProducts({
      search: searchQuery,
      category: filters.category || undefined,
      supplier: filters.supplier || undefined,
      status: filters.status || undefined,
      lowStock: filters.lowStock || undefined
    }),
    { keepPreviousData: true }
  );

  const { data: categoriesData } = useQuery(
    'categories',
    () => categoriesApi.getCategories()
  );

  const { data: suppliersData } = useQuery(
    'suppliers',
    () => suppliersApi.getSuppliers()
  );

  // Real-time updates
  useEffect(() => {
    if (socket) {
      socket.on('inventory_updated', (data) => {
        queryClient.invalidateQueries(['products']);
        toast.success(`Inventory updated: ${data.product.name}`);
      });

      socket.on('stock_alert', (data) => {
        toast.warning(`Low stock alert: ${data.product.name} (${data.currentStock} remaining)`);
      });

      return () => {
        socket.off('inventory_updated');
        socket.off('stock_alert');
      };
    }
  }, [socket, queryClient]);

  // Mutations
  const deleteProductMutation = useMutation(productsApi.deleteProduct, {
    onSuccess: () => {
      queryClient.invalidateQueries(['products']);
      toast.success('Product deleted successfully');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to delete product');
    }
  });

  // Handle product operations
  const handleEditProduct = (product: Product) => {
    setSelectedProduct(product);
    setIsProductDialogOpen(true);
  };

  const handleDeleteProduct = (productId: string) => {
    if (window.confirm('Are you sure you want to delete this product?')) {
      deleteProductMutation.mutate(productId);
    }
  };

  const handleStockAdjustment = (product: Product) => {
    setSelectedProduct(product);
    setIsStockDialogOpen(true);
  };

  const handleBarcodeScanned = (barcode: string) => {
    setSearchQuery(barcode);
    setIsScannerOpen(false);
  };

  // Calculate inventory metrics
  const inventoryMetrics = productsData?.products ? {
    total: productsData.products.length,
    lowStock: productsData.products.filter(p => p.currentStock <= p.minStock).length,
    outOfStock: productsData.products.filter(p => p.currentStock === 0).length,
    totalValue: productsData.products.reduce((sum, p) => sum + (p.currentStock * p.cost), 0)
  } : { total: 0, lowStock: 0, outOfStock: 0, totalValue: 0 };

  // DataGrid columns
  const columns: GridColDef[] = [
    {
      field: 'image',
      headerName: 'Image',
      width: 80,
      renderCell: (params) => (
        <Box
          component="img"
          src={params.value || '/default-product.png'}
          alt={params.row.name}
          sx={{
            width: 40,
            height: 40,
            objectFit: 'cover',
            borderRadius: 1
          }}
        />
      )
    },
    {
      field: 'name',
      headerName: 'Product Name',
      flex: 1,
      minWidth: 200
    },
    {
      field: 'sku',
      headerName: 'SKU',
      width: 120,
      fontFamily: 'monospace'
    },
    {
      field: 'category',
      headerName: 'Category',
      width: 130,
      valueGetter: (params) => params.row.category?.name || 'N/A'
    },
    {
      field: 'currentStock',
      headerName: 'Stock',
      width: 100,
      type: 'number',
      renderCell: (params) => {
        const stock = params.value;
        const minStock = params.row.minStock;
        
        return (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography
              variant="body2"
              color={stock === 0 ? 'error' : stock <= minStock ? 'warning.main' : 'inherit'}
            >
              {stock}
            </Typography>
            {stock <= minStock && (
              <Warning 
                fontSize="small" 
                color={stock === 0 ? 'error' : 'warning'} 
              />
            )}
          </Box>
        );
      }
    },
    {
      field: 'minStock',
      headerName: 'Min Stock',
      width: 100,
      type: 'number'
    },
    {
      field: 'price',
      headerName: 'Price',
      width: 100,
      type: 'number',
      valueFormatter: (params) => `$${params.value.toFixed(2)}`
    },
    {
      field: 'cost',
      headerName: 'Cost',
      width: 100,
      type: 'number',
      valueFormatter: (params) => `$${params.value.toFixed(2)}`
    },
    {
      field: 'status',
      headerName: 'Status',
      width: 120,
      renderCell: (params) => (
        <Chip
          label={params.value}
          size="small"
          color={
            params.value === 'ACTIVE' ? 'success' :
            params.value === 'INACTIVE' ? 'default' : 'error'
          }
        />
      )
    },
    {
      field: 'actions',
      type: 'actions',
      headerName: 'Actions',
      width: 120,
      getActions: (params) => [
        <GridActionsCellItem
          icon={<Visibility />}
          label="View"
          onClick={() => handleEditProduct(params.row)}
        />,
        <GridActionsCellItem
          icon={<Edit />}
          label="Edit"
          onClick={() => handleEditProduct(params.row)}
        />,
        <GridActionsCellItem
          icon={<TrendingUp />}
          label="Adjust Stock"
          onClick={() => handleStockAdjustment(params.row)}
        />,
        <GridActionsCellItem
          icon={<Delete />}
          label="Delete"
          onClick={() => handleDeleteProduct(params.row.id)}
          showInMenu
        />
      ]
    }
  ];

  // Speed dial actions
  const speedDialActions = [
    {
      icon: <Add />,
      name: 'Add Product',
      onClick: () => {
        setSelectedProduct(null);
        setIsProductDialogOpen(true);
      }
    },
    {
      icon: <QrCodeScanner />,
      name: 'Scan Barcode',
      onClick: () => setIsScannerOpen(true)
    },
    {
      icon: <Upload />,
      name: 'Bulk Import',
      onClick: () => setIsBulkDialogOpen(true)
    },
    {
      icon: <Download />,
      name: 'Export Data',
      onClick: () => {
        // TODO: Implement export functionality
        toast.info('Export functionality coming soon');
      }
    }
  ];

  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <Paper elevation={2} sx={{ p: 2, mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
          <Typography variant="h5" component="h1">
            Inventory Management
          </Typography>
          <Box sx={{ display: 'flex', gap: 2 }}>
            <Button
              variant="outlined"
              startIcon={<Refresh />}
              onClick={() => refetch()}
            >
              Refresh
            </Button>
            <Button
              variant="contained"
              startIcon={<Add />}
              onClick={() => {
                setSelectedProduct(null);
                setIsProductDialogOpen(true);
              }}
            >
              Add Product
            </Button>
          </Box>
        </Box>

        {/* Metrics Cards */}
        <Grid container spacing={3}>
          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Inventory color="primary" />
                  <Box>
                    <Typography variant="h4">{inventoryMetrics.total}</Typography>
                    <Typography color="textSecondary">Total Products</Typography>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Warning color="warning" />
                  <Box>
                    <Typography variant="h4" color="warning.main">
                      {inventoryMetrics.lowStock}
                    </Typography>
                    <Typography color="textSecondary">Low Stock</Typography>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <TrendingDown color="error" />
                  <Box>
                    <Typography variant="h4" color="error.main">
                      {inventoryMetrics.outOfStock}
                    </Typography>
                    <Typography color="textSecondary">Out of Stock</Typography>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Analytics color="success" />
                  <Box>
                    <Typography variant="h4" color="success.main">
                      ${inventoryMetrics.totalValue.toFixed(0)}
                    </Typography>
                    <Typography color="textSecondary">Total Value</Typography>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </Paper>

      {/* Tabs */}
      <Paper sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <Tabs value={tabValue} onChange={(e, v) => setTabValue(v)}>
          <Tab icon={<Inventory />} label="Products" />
          <Tab icon={<Analytics />} label="Analytics" />
          <Tab icon={<History />} label="Stock Movements" />
        </Tabs>

        <TabPanel value={tabValue} index={0}>
          {/* Search and Filters */}
          <Box sx={{ mb: 3, display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            <TextField
              placeholder="Search products, SKU, or barcode..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              InputProps={{
                startAdornment: <Search sx={{ mr: 1, color: 'action.active' }} />,
                endAdornment: (
                  <IconButton onClick={() => setIsScannerOpen(true)}>
                    <QrCodeScanner />
                  </IconButton>
                )
              }}
              sx={{ minWidth: 300 }}
            />
            <Button
              variant="outlined"
              startIcon={<FilterList />}
              onClick={(e) => setAnchorEl(e.currentTarget)}
            >
              Filters
            </Button>
          </Box>

          {/* Data Grid */}
          <Box sx={{ height: 500 }}>
            <DataGrid
              rows={productsData?.products || []}
              columns={columns}
              loading={isLoading}
              checkboxSelection
              disableRowSelectionOnClick
              onRowSelectionModelChange={(selection) => {
                setSelectedProducts(selection as string[]);
              }}
              slots={{ toolbar: GridToolbar }}
              slotProps={{
                toolbar: {
                  showQuickFilter: true,
                  quickFilterProps: { debounceMs: 500 }
                }
              }}
              sx={{
                '& .MuiDataGrid-row:hover': {
                  backgroundColor: 'action.hover'
                }
              }}
            />
          </Box>
        </TabPanel>

        <TabPanel value={tabValue} index={1}>
          <InventoryAnalytics />
        </TabPanel>

        <TabPanel value={tabValue} index={2}>
          {/* Stock Movements will be implemented */}
          <Typography variant="h6">Stock Movements</Typography>
          <Typography color="textSecondary">
            Stock movement history and tracking functionality coming soon.
          </Typography>
        </TabPanel>
      </Paper>

      {/* Speed Dial */}
      <SpeedDial
        ariaLabel="Inventory Actions"
        sx={{ position: 'fixed', bottom: 16, right: 16 }}
        icon={<SpeedDialIcon />}
      >
        {speedDialActions.map((action) => (
          <SpeedDialAction
            key={action.name}
            icon={action.icon}
            tooltipTitle={action.name}
            onClick={action.onClick}
          />
        ))}
      </SpeedDial>

      {/* Filter Menu */}
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={() => setAnchorEl(null)}
      >
        <MenuItem>
          <TextField
            select
            label="Category"
            value={filters.category}
            onChange={(e) => setFilters(prev => ({ ...prev, category: e.target.value }))}
            size="small"
            sx={{ minWidth: 150 }}
          >
            <MenuItem value="">All Categories</MenuItem>
            {categoriesData?.categories.map((cat) => (
              <MenuItem key={cat.id} value={cat.id}>
                {cat.name}
              </MenuItem>
            ))}
          </TextField>
        </MenuItem>
        <MenuItem>
          <TextField
            select
            label="Status"
            value={filters.status}
            onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value }))}
            size="small"
            sx={{ minWidth: 150 }}
          >
            <MenuItem value="">All Status</MenuItem>
            <MenuItem value="ACTIVE">Active</MenuItem>
            <MenuItem value="INACTIVE">Inactive</MenuItem>
            <MenuItem value="DISCONTINUED">Discontinued</MenuItem>
          </TextField>
        </MenuItem>
      </Menu>

      {/* Dialogs */}
      <ProductDialog
        open={isProductDialogOpen}
        onClose={() => {
          setIsProductDialogOpen(false);
          setSelectedProduct(null);
        }}
        product={selectedProduct}
        onSuccess={() => {
          queryClient.invalidateQueries(['products']);
          setIsProductDialogOpen(false);
          setSelectedProduct(null);
        }}
      />

      <StockAdjustmentDialog
        open={isStockDialogOpen}
        onClose={() => {
          setIsStockDialogOpen(false);
          setSelectedProduct(null);
        }}
        product={selectedProduct}
        onSuccess={() => {
          queryClient.invalidateQueries(['products']);
          setIsStockDialogOpen(false);
          setSelectedProduct(null);
        }}
      />

      <BulkOperationsDialog
        open={isBulkDialogOpen}
        onClose={() => setIsBulkDialogOpen(false)}
        onSuccess={() => {
          queryClient.invalidateQueries(['products']);
          setIsBulkDialogOpen(false);
        }}
      />

      <BarcodeScanner
        open={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onScan={handleBarcodeScanned}
      />
    </Box>
  );
};

export default InventoryManagement;