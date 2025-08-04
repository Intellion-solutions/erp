import React, { useState, useEffect } from 'react';
import {
  Box,
  Grid,
  Card,
  CardContent,
  Typography,
  IconButton,
  Chip,
  LinearProgress,
  Avatar,
  List,
  ListItem,
  ListItemText,
  ListItemAvatar,
  Divider,
  Button,
  Menu,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  Alert,
  Skeleton
} from '@mui/material';
import {
  TrendingUp,
  TrendingDown,
  ShoppingCart,
  People,
  Inventory,
  AttachMoney,
  Notifications,
  MoreVert,
  Refresh,
  Download,
  Visibility,
  VisibilityOff
} from '@mui/icons-material';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';
import { useQuery } from 'react-query';
import { format } from 'date-fns';
import { toast } from 'react-hot-toast';

// API service
import { dashboardApi } from '../../services/api';

// Types
interface DashboardMetrics {
  totalSales: number;
  totalRevenue: number;
  totalTax: number;
  totalDiscount: number;
  completedSales: number;
  pendingSales: number;
  averageOrderValue: number;
  newCustomers: number;
  inventoryValue: number;
  lowStockProducts: number;
}

interface SalesData {
  date: string;
  amount: number;
}

interface PaymentMethodData {
  [key: string]: number;
}

interface DashboardData {
  period: number;
  metrics: DashboardMetrics;
  paymentMethods: PaymentMethodData;
  dailySales: SalesData[];
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8'];

const AdvancedDashboard: React.FC = () => {
  const [period, setPeriod] = useState(30);
  const [refreshKey, setRefreshKey] = useState(0);
  const [showSensitiveData, setShowSensitiveData] = useState(false);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

  // Fetch dashboard data
  const { data: dashboardData, isLoading, error, refetch } = useQuery(
    ['dashboard', period, refreshKey],
    () => dashboardApi.getDashboard(period),
    {
      refetchInterval: 300000, // Refresh every 5 minutes
      staleTime: 60000, // Consider data stale after 1 minute
    }
  );

  // Fetch real-time notifications
  const { data: notifications } = useQuery(
    ['notifications'],
    () => dashboardApi.getNotifications(),
    {
      refetchInterval: 30000, // Refresh every 30 seconds
    }
  );

  const handleRefresh = () => {
    setRefreshKey(prev => prev + 1);
    toast.success('Dashboard refreshed');
  };

  const handleExport = () => {
    // Implement export functionality
    toast.success('Export started');
  };

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  if (error) {
    return (
      <Alert severity="error" sx={{ mb: 2 }}>
        Failed to load dashboard data. Please try again.
      </Alert>
    );
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('en-US').format(num);
  };

  const getMetricIcon = (metric: string) => {
    switch (metric) {
      case 'sales':
        return <ShoppingCart />;
      case 'customers':
        return <People />;
      case 'inventory':
        return <Inventory />;
      case 'revenue':
        return <AttachMoney />;
      default:
        return <TrendingUp />;
    }
  };

  const getMetricColor = (metric: string) => {
    switch (metric) {
      case 'sales':
        return '#2196F3';
      case 'customers':
        return '#4CAF50';
      case 'inventory':
        return '#FF9800';
      case 'revenue':
        return '#9C27B0';
      default:
        return '#607D8B';
    }
  };

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4" gutterBottom>
            Dashboard
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Real-time business insights and analytics
          </Typography>
        </Box>
        
        <Box sx={{ display: 'flex', gap: 1 }}>
          <FormControl size="small" sx={{ minWidth: 120 }}>
            <InputLabel>Period</InputLabel>
            <Select
              value={period}
              label="Period"
              onChange={(e) => setPeriod(Number(e.target.value))}
            >
              <MenuItem value={7}>Last 7 days</MenuItem>
              <MenuItem value={30}>Last 30 days</MenuItem>
              <MenuItem value={90}>Last 90 days</MenuItem>
              <MenuItem value={365}>Last year</MenuItem>
            </Select>
          </FormControl>
          
          <IconButton onClick={handleRefresh} disabled={isLoading}>
            <Refresh />
          </IconButton>
          
          <IconButton onClick={handleMenuOpen}>
            <MoreVert />
          </IconButton>
          
          <Menu
            anchorEl={anchorEl}
            open={Boolean(anchorEl)}
            onClose={handleMenuClose}
          >
            <MenuItem onClick={handleExport}>
              <Download sx={{ mr: 1 }} />
              Export Data
            </MenuItem>
            <MenuItem onClick={() => setShowSensitiveData(!showSensitiveData)}>
              {showSensitiveData ? <VisibilityOff sx={{ mr: 1 }} /> : <Visibility sx={{ mr: 1 }} />}
              {showSensitiveData ? 'Hide' : 'Show'} Sensitive Data
            </MenuItem>
          </Menu>
        </Box>
      </Box>

      {isLoading ? (
        <Grid container spacing={3}>
          {[...Array(8)].map((_, index) => (
            <Grid item xs={12} sm={6} md={3} key={index}>
              <Card>
                <CardContent>
                  <Skeleton variant="rectangular" height={60} />
                  <Skeleton variant="text" sx={{ mt: 1 }} />
                  <Skeleton variant="text" width="60%" />
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      ) : (
        <>
          {/* Key Metrics */}
          <Grid container spacing={3} sx={{ mb: 3 }}>
            <Grid item xs={12} sm={6} md={3}>
              <Card>
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                    <Avatar sx={{ bgcolor: getMetricColor('revenue'), mr: 2 }}>
                      <AttachMoney />
                    </Avatar>
                    <Box sx={{ flexGrow: 1 }}>
                      <Typography variant="h6">
                        {formatCurrency(dashboardData?.metrics.totalRevenue || 0)}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Total Revenue
                      </Typography>
                    </Box>
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center' }}>
                    <TrendingUp sx={{ color: 'success.main', mr: 1 }} />
                    <Typography variant="body2" color="success.main">
                      +12.5%
                    </Typography>
                  </Box>
                </CardContent>
              </Card>
            </Grid>

            <Grid item xs={12} sm={6} md={3}>
              <Card>
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                    <Avatar sx={{ bgcolor: getMetricColor('sales'), mr: 2 }}>
                      <ShoppingCart />
                    </Avatar>
                    <Box sx={{ flexGrow: 1 }}>
                      <Typography variant="h6">
                        {formatNumber(dashboardData?.metrics.completedSales || 0)}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Completed Sales
                      </Typography>
                    </Box>
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center' }}>
                    <TrendingUp sx={{ color: 'success.main', mr: 1 }} />
                    <Typography variant="body2" color="success.main">
                      +8.3%
                    </Typography>
                  </Box>
                </CardContent>
              </Card>
            </Grid>

            <Grid item xs={12} sm={6} md={3}>
              <Card>
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                    <Avatar sx={{ bgcolor: getMetricColor('customers'), mr: 2 }}>
                      <People />
                    </Avatar>
                    <Box sx={{ flexGrow: 1 }}>
                      <Typography variant="h6">
                        {formatNumber(dashboardData?.metrics.newCustomers || 0)}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        New Customers
                      </Typography>
                    </Box>
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center' }}>
                    <TrendingUp sx={{ color: 'success.main', mr: 1 }} />
                    <Typography variant="body2" color="success.main">
                      +15.2%
                    </Typography>
                  </Box>
                </CardContent>
              </Card>
            </Grid>

            <Grid item xs={12} sm={6} md={3}>
              <Card>
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                    <Avatar sx={{ bgcolor: getMetricColor('inventory'), mr: 2 }}>
                      <Inventory />
                    </Avatar>
                    <Box sx={{ flexGrow: 1 }}>
                      <Typography variant="h6">
                        {formatCurrency(dashboardData?.metrics.inventoryValue || 0)}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Inventory Value
                      </Typography>
                    </Box>
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center' }}>
                    <TrendingDown sx={{ color: 'warning.main', mr: 1 }} />
                    <Typography variant="body2" color="warning.main">
                      -2.1%
                    </Typography>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          {/* Charts Section */}
          <Grid container spacing={3} sx={{ mb: 3 }}>
            {/* Sales Trend Chart */}
            <Grid item xs={12} lg={8}>
              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    Sales Trend
                  </Typography>
                  <ResponsiveContainer width="100%" height={300}>
                    <AreaChart data={dashboardData?.dailySales || []}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis 
                        dataKey="date" 
                        tickFormatter={(value) => format(new Date(value), 'MMM dd')}
                      />
                      <YAxis />
                      <Tooltip 
                        formatter={(value: number) => [formatCurrency(value), 'Sales']}
                        labelFormatter={(label) => format(new Date(label), 'MMM dd, yyyy')}
                      />
                      <Area 
                        type="monotone" 
                        dataKey="amount" 
                        stroke="#8884d8" 
                        fill="#8884d8" 
                        fillOpacity={0.3}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </Grid>

            {/* Payment Methods Chart */}
            <Grid item xs={12} lg={4}>
              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    Payment Methods
                  </Typography>
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={Object.entries(dashboardData?.paymentMethods || {}).map(([key, value]) => ({
                          name: key,
                          value
                        }))}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {Object.entries(dashboardData?.paymentMethods || {}).map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          {/* Additional Metrics and Alerts */}
          <Grid container spacing={3}>
            {/* Performance Metrics */}
            <Grid item xs={12} md={6}>
              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    Performance Metrics
                  </Typography>
                  
                  <Box sx={{ mb: 2 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                      <Typography variant="body2">Average Order Value</Typography>
                      <Typography variant="body2" fontWeight="bold">
                        {formatCurrency(dashboardData?.metrics.averageOrderValue || 0)}
                      </Typography>
                    </Box>
                    <LinearProgress 
                      variant="determinate" 
                      value={Math.min((dashboardData?.metrics.averageOrderValue || 0) / 100, 100)} 
                      sx={{ height: 8, borderRadius: 4 }}
                    />
                  </Box>

                  <Box sx={{ mb: 2 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                      <Typography variant="body2">Conversion Rate</Typography>
                      <Typography variant="body2" fontWeight="bold">3.2%</Typography>
                    </Box>
                    <LinearProgress 
                      variant="determinate" 
                      value={3.2} 
                      sx={{ height: 8, borderRadius: 4 }}
                    />
                  </Box>

                  <Box sx={{ mb: 2 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                      <Typography variant="body2">Customer Retention</Typography>
                      <Typography variant="body2" fontWeight="bold">87%</Typography>
                    </Box>
                    <LinearProgress 
                      variant="determinate" 
                      value={87} 
                      sx={{ height: 8, borderRadius: 4 }}
                    />
                  </Box>
                </CardContent>
              </Card>
            </Grid>

            {/* Alerts and Notifications */}
            <Grid item xs={12} md={6}>
              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    Alerts & Notifications
                  </Typography>
                  
                  <List>
                    {dashboardData?.metrics.lowStockProducts > 0 && (
                      <ListItem>
                        <ListItemAvatar>
                          <Avatar sx={{ bgcolor: 'warning.main' }}>
                            <Inventory />
                          </Avatar>
                        </ListItemAvatar>
                        <ListItemText
                          primary={`${dashboardData.metrics.lowStockProducts} products low on stock`}
                          secondary="Consider reordering soon"
                        />
                        <Chip label="Medium" color="warning" size="small" />
                      </ListItem>
                    )}
                    
                    {dashboardData?.metrics.pendingSales > 0 && (
                      <ListItem>
                        <ListItemAvatar>
                          <Avatar sx={{ bgcolor: 'info.main' }}>
                            <ShoppingCart />
                          </Avatar>
                        </ListItemAvatar>
                        <ListItemText
                          primary={`${dashboardData.metrics.pendingSales} pending sales`}
                          secondary="Require attention"
                        />
                        <Chip label="High" color="info" size="small" />
                      </ListItem>
                    )}
                    
                    <ListItem>
                      <ListItemAvatar>
                        <Avatar sx={{ bgcolor: 'success.main' }}>
                          <Notifications />
                        </Avatar>
                      </ListItemAvatar>
                      <ListItemText
                        primary="System running smoothly"
                        secondary="All systems operational"
                      />
                      <Chip label="Good" color="success" size="small" />
                    </ListItem>
                  </List>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </>
      )}
    </Box>
  );
};

export default AdvancedDashboard;