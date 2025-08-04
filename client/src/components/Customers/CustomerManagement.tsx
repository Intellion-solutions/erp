import React, { useState, useEffect } from 'react';
import {
  Box,
  Grid,
  Card,
  CardContent,
  Typography,
  Button,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  Chip,
  Avatar,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  InputAdornment,
  Pagination,
  Alert,
  Skeleton,
  Tabs,
  Tab,
  List,
  ListItem,
  ListItemText,
  ListItemAvatar,
  Divider,
  Badge,
  Tooltip,
  Menu,
  MenuItem as MenuItemComponent
} from '@mui/material';
import {
  Add,
  Search,
  FilterList,
  Edit,
  Delete,
  Visibility,
  Loyalty,
  Email,
  Phone,
  LocationOn,
  MoreVert,
  Download,
  Upload,
  Refresh,
  Star,
  StarBorder,
  TrendingUp,
  ShoppingCart,
  Person
} from '@mui/icons-material';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { toast } from 'react-hot-toast';
import { format } from 'date-fns';

// API service
import { customerApi } from '../../services/api';

// Types
interface Customer {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  country: string;
  postalCode: string;
  type: 'RETAIL' | 'WHOLESALE' | 'VIP' | 'CORPORATE';
  loyaltyPoints: number;
  totalSpent: number;
  lastPurchase: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  _count: {
    sales: number;
    returns: number;
  };
}

interface CustomerFormData {
  name: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  country: string;
  postalCode: string;
  type: string;
  creditLimit: number;
  notes: string;
}

const CustomerManagement: React.FC = () => {
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [search, setSearch] = useState('');
  const [type, setType] = useState('');
  const [status, setStatus] = useState('');
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState('desc');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState(0);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [selectedCustomerForMenu, setSelectedCustomerForMenu] = useState<Customer | null>(null);

  const queryClient = useQueryClient();

  // Fetch customers
  const { data: customersData, isLoading, error } = useQuery(
    ['customers', page, limit, search, type, status, sortBy, sortOrder],
    () => customerApi.getCustomers({
      page,
      limit,
      search,
      type,
      status,
      sortBy,
      sortOrder
    }),
    {
      keepPreviousData: true,
    }
  );

  // Fetch customer analytics
  const { data: analyticsData } = useQuery(
    ['customer-analytics'],
    () => customerApi.getCustomerAnalytics(),
    {
      refetchInterval: 300000, // Refresh every 5 minutes
    }
  );

  // Mutations
  const createCustomerMutation = useMutation(
    (data: CustomerFormData) => customerApi.createCustomer(data),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['customers']);
        toast.success('Customer created successfully');
        setIsDialogOpen(false);
      },
      onError: (error: any) => {
        toast.error(error.response?.data?.error || 'Failed to create customer');
      }
    }
  );

  const updateCustomerMutation = useMutation(
    ({ id, data }: { id: string; data: Partial<CustomerFormData> }) =>
      customerApi.updateCustomer(id, data),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['customers']);
        toast.success('Customer updated successfully');
        setIsDialogOpen(false);
      },
      onError: (error: any) => {
        toast.error(error.response?.data?.error || 'Failed to update customer');
      }
    }
  );

  const deleteCustomerMutation = useMutation(
    (id: string) => customerApi.deleteCustomer(id),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['customers']);
        toast.success('Customer deleted successfully');
      },
      onError: (error: any) => {
        toast.error(error.response?.data?.error || 'Failed to delete customer');
      }
    }
  );

  const [formData, setFormData] = useState<CustomerFormData>({
    name: '',
    email: '',
    phone: '',
    address: '',
    city: '',
    state: '',
    country: '',
    postalCode: '',
    type: 'RETAIL',
    creditLimit: 0,
    notes: ''
  });

  const handleOpenDialog = (customer?: Customer) => {
    if (customer) {
      setSelectedCustomer(customer);
      setFormData({
        name: customer.name,
        email: customer.email || '',
        phone: customer.phone || '',
        address: customer.address || '',
        city: customer.city || '',
        state: customer.state || '',
        country: customer.country || '',
        postalCode: customer.postalCode || '',
        type: customer.type,
        creditLimit: 0,
        notes: ''
      });
    } else {
      setSelectedCustomer(null);
      setFormData({
        name: '',
        email: '',
        phone: '',
        address: '',
        city: '',
        state: '',
        country: '',
        postalCode: '',
        type: 'RETAIL',
        creditLimit: 0,
        notes: ''
      });
    }
    setIsDialogOpen(true);
  };

  const handleSubmit = () => {
    if (selectedCustomer) {
      updateCustomerMutation.mutate({ id: selectedCustomer.id, data: formData });
    } else {
      createCustomerMutation.mutate(formData);
    }
  };

  const handleDelete = (id: string) => {
    if (window.confirm('Are you sure you want to delete this customer?')) {
      deleteCustomerMutation.mutate(id);
    }
  };

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>, customer: Customer) => {
    setAnchorEl(event.currentTarget);
    setSelectedCustomerForMenu(customer);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
    setSelectedCustomerForMenu(null);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const formatDate = (date: string) => {
    return format(new Date(date), 'MMM dd, yyyy');
  };

  const getCustomerTypeColor = (type: string) => {
    switch (type) {
      case 'VIP':
        return 'error';
      case 'CORPORATE':
        return 'primary';
      case 'WHOLESALE':
        return 'warning';
      default:
        return 'default';
    }
  };

  const getCustomerTypeIcon = (type: string) => {
    switch (type) {
      case 'VIP':
        return <Star />;
      case 'CORPORATE':
        return <Person />;
      case 'WHOLESALE':
        return <ShoppingCart />;
      default:
        return <Person />;
    }
  };

  if (error) {
    return (
      <Alert severity="error" sx={{ mb: 2 }}>
        Failed to load customers. Please try again.
      </Alert>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4" gutterBottom>
            Customer Management
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Manage customers, loyalty programs, and customer relationships
          </Typography>
        </Box>
        
        <Button
          variant="contained"
          startIcon={<Add />}
          onClick={() => handleOpenDialog()}
        >
          Add Customer
        </Button>
      </Box>

      {/* Analytics Cards */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                <Avatar sx={{ bgcolor: 'primary.main', mr: 2 }}>
                  <Person />
                </Avatar>
                <Box>
                  <Typography variant="h6">
                    {analyticsData?.summary?.totalCustomers || 0}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Total Customers
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                <Avatar sx={{ bgcolor: 'success.main', mr: 2 }}>
                  <TrendingUp />
                </Avatar>
                <Box>
                  <Typography variant="h6">
                    {analyticsData?.summary?.activeCustomers || 0}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Active Customers
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                <Avatar sx={{ bgcolor: 'warning.main', mr: 2 }}>
                  <Loyalty />
                </Avatar>
                <Box>
                  <Typography variant="h6">
                    {analyticsData?.summary?.averageLoyaltyPoints || 0}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Avg Loyalty Points
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                <Avatar sx={{ bgcolor: 'info.main', mr: 2 }}>
                  <ShoppingCart />
                </Avatar>
                <Box>
                  <Typography variant="h6">
                    {formatCurrency(analyticsData?.topCustomers?.[0]?.totalSpent || 0)}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Top Customer Spent
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Filters and Search */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} md={4}>
              <TextField
                fullWidth
                placeholder="Search customers..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <Search />
                    </InputAdornment>
                  ),
                }}
              />
            </Grid>
            
            <Grid item xs={12} md={2}>
              <FormControl fullWidth>
                <InputLabel>Type</InputLabel>
                <Select
                  value={type}
                  label="Type"
                  onChange={(e) => setType(e.target.value)}
                >
                  <MenuItem value="">All Types</MenuItem>
                  <MenuItem value="RETAIL">Retail</MenuItem>
                  <MenuItem value="WHOLESALE">Wholesale</MenuItem>
                  <MenuItem value="VIP">VIP</MenuItem>
                  <MenuItem value="CORPORATE">Corporate</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            
            <Grid item xs={12} md={2}>
              <FormControl fullWidth>
                <InputLabel>Status</InputLabel>
                <Select
                  value={status}
                  label="Status"
                  onChange={(e) => setStatus(e.target.value)}
                >
                  <MenuItem value="">All Status</MenuItem>
                  <MenuItem value="true">Active</MenuItem>
                  <MenuItem value="false">Inactive</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            
            <Grid item xs={12} md={2}>
              <FormControl fullWidth>
                <InputLabel>Sort By</InputLabel>
                <Select
                  value={sortBy}
                  label="Sort By"
                  onChange={(e) => setSortBy(e.target.value)}
                >
                  <MenuItem value="createdAt">Date Created</MenuItem>
                  <MenuItem value="name">Name</MenuItem>
                  <MenuItem value="totalSpent">Total Spent</MenuItem>
                  <MenuItem value="loyaltyPoints">Loyalty Points</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            
            <Grid item xs={12} md={2}>
              <Button
                fullWidth
                variant="outlined"
                startIcon={<Refresh />}
                onClick={() => {
                  setSearch('');
                  setType('');
                  setStatus('');
                  setSortBy('createdAt');
                  setSortOrder('desc');
                }}
              >
                Reset
              </Button>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Customers Table */}
      <Card>
        <CardContent>
          {isLoading ? (
            <Box>
              {[...Array(5)].map((_, index) => (
                <Skeleton key={index} variant="rectangular" height={60} sx={{ mb: 1 }} />
              ))}
            </Box>
          ) : (
            <>
              <TableContainer>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>Customer</TableCell>
                      <TableCell>Type</TableCell>
                      <TableCell>Contact</TableCell>
                      <TableCell>Loyalty Points</TableCell>
                      <TableCell>Total Spent</TableCell>
                      <TableCell>Orders</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell>Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {customersData?.customers?.map((customer) => (
                      <TableRow key={customer.id} hover>
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center' }}>
                            <Avatar sx={{ mr: 2 }}>
                              {customer.name.charAt(0).toUpperCase()}
                            </Avatar>
                            <Box>
                              <Typography variant="subtitle2">
                                {customer.name}
                              </Typography>
                              <Typography variant="body2" color="text.secondary">
                                Joined {formatDate(customer.createdAt)}
                              </Typography>
                            </Box>
                          </Box>
                        </TableCell>
                        
                        <TableCell>
                          <Chip
                            icon={getCustomerTypeIcon(customer.type)}
                            label={customer.type}
                            color={getCustomerTypeColor(customer.type) as any}
                            size="small"
                          />
                        </TableCell>
                        
                        <TableCell>
                          <Box>
                            {customer.email && (
                              <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.5 }}>
                                <Email sx={{ fontSize: 16, mr: 1, color: 'text.secondary' }} />
                                <Typography variant="body2">{customer.email}</Typography>
                              </Box>
                            )}
                            {customer.phone && (
                              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                <Phone sx={{ fontSize: 16, mr: 1, color: 'text.secondary' }} />
                                <Typography variant="body2">{customer.phone}</Typography>
                              </Box>
                            )}
                          </Box>
                        </TableCell>
                        
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center' }}>
                            <Loyalty sx={{ mr: 1, color: 'warning.main' }} />
                            <Typography variant="body2">
                              {customer.loyaltyPoints} pts
                            </Typography>
                          </Box>
                        </TableCell>
                        
                        <TableCell>
                          <Typography variant="body2" fontWeight="bold">
                            {formatCurrency(customer.totalSpent)}
                          </Typography>
                        </TableCell>
                        
                        <TableCell>
                          <Typography variant="body2">
                            {customer._count.sales} orders
                          </Typography>
                        </TableCell>
                        
                        <TableCell>
                          <Chip
                            label={customer.isActive ? 'Active' : 'Inactive'}
                            color={customer.isActive ? 'success' : 'default'}
                            size="small"
                          />
                        </TableCell>
                        
                        <TableCell>
                          <IconButton
                            onClick={(e) => handleMenuOpen(e, customer)}
                            size="small"
                          >
                            <MoreVert />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
              
              {/* Pagination */}
              {customersData?.pagination && (
                <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
                  <Pagination
                    count={customersData.pagination.pages}
                    page={page}
                    onChange={(_, value) => setPage(value)}
                    color="primary"
                  />
                </Box>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Customer Dialog */}
      <Dialog open={isDialogOpen} onClose={() => setIsDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>
          {selectedCustomer ? 'Edit Customer' : 'Add New Customer'}
        </DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />
            </Grid>
            
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              />
            </Grid>
            
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Phone"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              />
            </Grid>
            
            <Grid item xs={12} md={6}>
              <FormControl fullWidth>
                <InputLabel>Type</InputLabel>
                <Select
                  value={formData.type}
                  label="Type"
                  onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                >
                  <MenuItem value="RETAIL">Retail</MenuItem>
                  <MenuItem value="WHOLESALE">Wholesale</MenuItem>
                  <MenuItem value="VIP">VIP</MenuItem>
                  <MenuItem value="CORPORATE">Corporate</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Address"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              />
            </Grid>
            
            <Grid item xs={12} md={4}>
              <TextField
                fullWidth
                label="City"
                value={formData.city}
                onChange={(e) => setFormData({ ...formData, city: e.target.value })}
              />
            </Grid>
            
            <Grid item xs={12} md={4}>
              <TextField
                fullWidth
                label="State"
                value={formData.state}
                onChange={(e) => setFormData({ ...formData, state: e.target.value })}
              />
            </Grid>
            
            <Grid item xs={12} md={4}>
              <TextField
                fullWidth
                label="Postal Code"
                value={formData.postalCode}
                onChange={(e) => setFormData({ ...formData, postalCode: e.target.value })}
              />
            </Grid>
            
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Notes"
                multiline
                rows={3}
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setIsDialogOpen(false)}>Cancel</Button>
          <Button
            onClick={handleSubmit}
            variant="contained"
            disabled={!formData.name || createCustomerMutation.isLoading || updateCustomerMutation.isLoading}
          >
            {selectedCustomer ? 'Update' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Customer Menu */}
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleMenuClose}
      >
        <MenuItemComponent onClick={() => {
          if (selectedCustomerForMenu) {
            handleOpenDialog(selectedCustomerForMenu);
          }
          handleMenuClose();
        }}>
          <Edit sx={{ mr: 1 }} />
          Edit
        </MenuItemComponent>
        
        <MenuItemComponent onClick={() => {
          if (selectedCustomerForMenu) {
            setSelectedCustomer(selectedCustomerForMenu);
            setIsViewDialogOpen(true);
          }
          handleMenuClose();
        }}>
          <Visibility sx={{ mr: 1 }} />
          View Details
        </MenuItemComponent>
        
        <MenuItemComponent onClick={() => {
          if (selectedCustomerForMenu) {
            handleDelete(selectedCustomerForMenu.id);
          }
          handleMenuClose();
        }}>
          <Delete sx={{ mr: 1 }} />
          Delete
        </MenuItemComponent>
      </Menu>
    </Box>
  );
};

export default CustomerManagement;