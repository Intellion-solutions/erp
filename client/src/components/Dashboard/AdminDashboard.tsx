import React, { useState, useEffect } from 'react';
import {
  Box,
  Grid,
  Paper,
  Typography,
  Card,
  CardContent,
  CardHeader,
  IconButton,
  Chip,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Avatar,
  LinearProgress,
  Divider,
  Alert,
  Button,
  Menu,
  MenuItem,
  Badge,
  Tooltip,
  CircularProgress
} from '@mui/material';
import {
  TrendingUp,
  TrendingDown,
  AttachMoney,
  Inventory,
  People,
  ShoppingCart,
  Warning,
  CheckCircle,
  Schedule,
  Refresh,
  MoreVert,
  Notifications,
  Analytics,
  Assignment,
  LocalShipping,
  AccountBalance,
  Assessment,
  Timeline,
  PieChart,
  BarChart,
  ShowChart,
  Add
} from '@mui/icons-material';
import { LineChart, Line, AreaChart, Area, BarChart as RechartsBarChart, Bar, PieChart as RechartsPieChart, Cell, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer } from 'recharts';
import { useQuery } from 'react-query';
import { format, subDays, startOfDay, endOfDay } from 'date-fns';

import { reportsApi, salesApi, productsApi, usersApi } from '../../services/api';
import { useAuth } from '../../hooks/useAuth';
import { useSocket } from '../../hooks/useSocket';

interface DashboardMetric {
  title: string;
  value: string | number;
  change: number;
  icon: React.ReactNode;
  color: string;
  trend: 'up' | 'down' | 'neutral';
}

interface RecentActivity {
  id: string;
  type: 'sale' | 'purchase' | 'inventory' | 'user';
  title: string;
  description: string;
  timestamp: string;
  amount?: number;
  user?: string;
}

const COLORS = ['#8884d8', '#82ca9d', '#ffc658', '#ff7300', '#8dd1e1'];

const AdminDashboard: React.FC = () => {
  const { user } = useAuth();
  const { socket, isConnected } = useSocket();
  
  const [dateRange, setDateRange] = useState('7d');
  const [refreshing, setRefreshing] = useState(false);
  const [realtimeUpdates, setRealtimeUpdates] = useState<any[]>([]);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

  // Calculate date range
  const getDateRange = () => {
    const end = new Date();
    const days = parseInt(dateRange.replace('d', ''));
    const start = subDays(end, days);
    return {
      startDate: format(start, 'yyyy-MM-dd'),
      endDate: format(end, 'yyyy-MM-dd')
    };
  };

  // Queries
  const { data: dashboardStats, isLoading, refetch } = useQuery(
    ['dashboard-stats', dateRange],
    () => reportsApi.getDashboardStats(getDateRange()),
    {
      refetchInterval: 30000, // Refresh every 30 seconds
      keepPreviousData: true
    }
  );

  const { data: salesData } = useQuery(
    ['sales-analytics', dateRange],
    () => reportsApi.getSalesReport({ ...getDateRange(), groupBy: 'day' }),
    { keepPreviousData: true }
  );

  const { data: inventoryData } = useQuery(
    'inventory-report',
    () => reportsApi.getInventoryReport(),
    { keepPreviousData: true }
  );

  // Real-time updates
  useEffect(() => {
    if (socket && isConnected) {
      socket.on('dashboard_update', (data) => {
        setRealtimeUpdates(prev => [data, ...prev.slice(0, 9)]);
        refetch();
      });

      socket.on('new_sale', (data) => {
        setRealtimeUpdates(prev => [
          {
            id: Date.now().toString(),
            type: 'sale',
            title: 'New Sale',
            description: `Sale #${data.saleNumber} - $${data.total}`,
            timestamp: new Date().toISOString(),
            amount: data.total
          },
          ...prev.slice(0, 9)
        ]);
      });

      socket.on('stock_alert', (data) => {
        setRealtimeUpdates(prev => [
          {
            id: Date.now().toString(),
            type: 'inventory',
            title: 'Stock Alert',
            description: `${data.product.name} - Low stock (${data.currentStock} remaining)`,
            timestamp: new Date().toISOString()
          },
          ...prev.slice(0, 9)
        ]);
      });

      return () => {
        socket.off('dashboard_update');
        socket.off('new_sale');
        socket.off('stock_alert');
      };
    }
  }, [socket, isConnected, refetch]);

  // Manual refresh
  const handleRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setTimeout(() => setRefreshing(false), 1000);
  };

  // Dashboard metrics
  const metrics: DashboardMetric[] = dashboardStats ? [
    {
      title: 'Total Revenue',
      value: `$${dashboardStats.totalRevenue?.toLocaleString() || 0}`,
      change: dashboardStats.revenueGrowth || 0,
      icon: <AttachMoney />,
      color: '#4caf50',
      trend: (dashboardStats.revenueGrowth || 0) >= 0 ? 'up' : 'down'
    },
    {
      title: 'Total Orders',
      value: dashboardStats.totalOrders || 0,
      change: dashboardStats.ordersGrowth || 0,
      icon: <ShoppingCart />,
      color: '#2196f3',
      trend: (dashboardStats.ordersGrowth || 0) >= 0 ? 'up' : 'down'
    },
    {
      title: 'Active Products',
      value: dashboardStats.activeProducts || 0,
      change: dashboardStats.productsGrowth || 0,
      icon: <Inventory />,
      color: '#ff9800',
      trend: (dashboardStats.productsGrowth || 0) >= 0 ? 'up' : 'down'
    },
    {
      title: 'Total Users',
      value: dashboardStats.totalUsers || 0,
      change: dashboardStats.usersGrowth || 0,
      icon: <People />,
      color: '#9c27b0',
      trend: (dashboardStats.usersGrowth || 0) >= 0 ? 'up' : 'down'
    }
  ] : [];

  // Sales trend data
  const salesTrendData = salesData?.dailyData?.map((item: any) => ({
    date: format(new Date(item.date), 'MMM dd'),
    revenue: item.revenue,
    orders: item.orders,
    customers: item.customers
  })) || [];

  // Top products data
  const topProductsData = inventoryData?.topSellingProducts?.slice(0, 5).map((item: any, index: number) => ({
    name: item.name,
    sales: item.totalSold,
    revenue: item.revenue,
    color: COLORS[index % COLORS.length]
  })) || [];

  // Category distribution
  const categoryData = inventoryData?.categoryDistribution?.map((item: any, index: number) => ({
    name: item.category,
    value: item.count,
    color: COLORS[index % COLORS.length]
  })) || [];

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <CircularProgress size={60} />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3, minHeight: '100vh', bgcolor: 'background.default' }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4" fontWeight="bold">
            Dashboard
          </Typography>
          <Typography variant="body1" color="textSecondary">
            Welcome back, {user?.firstName}! Here's what's happening with your business.
          </Typography>
        </Box>
        
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
          <Badge color="success" variant="dot" invisible={!isConnected}>
            <Chip
              label={isConnected ? 'Live' : 'Offline'}
              color={isConnected ? 'success' : 'default'}
              size="small"
            />
          </Badge>
          
          <Button
            variant="outlined"
            startIcon={refreshing ? <CircularProgress size={16} /> : <Refresh />}
            onClick={handleRefresh}
            disabled={refreshing}
          >
            Refresh
          </Button>
          
          <IconButton onClick={(e) => setAnchorEl(e.currentTarget)}>
            <MoreVert />
          </IconButton>
        </Box>
      </Box>

      <Grid container spacing={3}>
        {/* Key Metrics */}
        <Grid item xs={12}>
          <Grid container spacing={3}>
            {metrics.map((metric, index) => (
              <Grid item xs={12} sm={6} md={3} key={index}>
                <Card>
                  <CardContent>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Box>
                        <Typography color="textSecondary" gutterBottom>
                          {metric.title}
                        </Typography>
                        <Typography variant="h5" fontWeight="bold">
                          {metric.value}
                        </Typography>
                        <Box sx={{ display: 'flex', alignItems: 'center', mt: 1 }}>
                          {metric.trend === 'up' ? (
                            <TrendingUp sx={{ color: 'success.main', fontSize: 16, mr: 0.5 }} />
                          ) : metric.trend === 'down' ? (
                            <TrendingDown sx={{ color: 'error.main', fontSize: 16, mr: 0.5 }} />
                          ) : null}
                          <Typography
                            variant="body2"
                            color={metric.trend === 'up' ? 'success.main' : metric.trend === 'down' ? 'error.main' : 'textSecondary'}
                          >
                            {Math.abs(metric.change).toFixed(1)}%
                          </Typography>
                          <Typography variant="body2" color="textSecondary" sx={{ ml: 0.5 }}>
                            vs last period
                          </Typography>
                        </Box>
                      </Box>
                      <Avatar sx={{ bgcolor: metric.color, width: 56, height: 56 }}>
                        {metric.icon}
                      </Avatar>
                    </Box>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Grid>

        {/* Sales Trend Chart */}
        <Grid item xs={12} lg={8}>
          <Card>
            <CardHeader
              title="Sales Trend"
              subheader="Revenue and orders over time"
              action={
                <Button size="small" onClick={(e) => setAnchorEl(e.currentTarget)}>
                  Last {dateRange}
                </Button>
              }
            />
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={salesTrendData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis yAxisId="left" />
                  <YAxis yAxisId="right" orientation="right" />
                  <RechartsTooltip />
                  <Legend />
                  <Area
                    yAxisId="left"
                    type="monotone"
                    dataKey="revenue"
                    stackId="1"
                    stroke="#8884d8"
                    fill="#8884d8"
                    fillOpacity={0.6}
                  />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="orders"
                    stroke="#82ca9d"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </Grid>

        {/* Real-time Activity */}
        <Grid item xs={12} lg={4}>
          <Card>
            <CardHeader
              title="Real-time Activity"
              subheader="Live updates from your system"
              avatar={
                <Badge color="success" variant="dot" invisible={!isConnected}>
                  <Notifications />
                </Badge>
              }
            />
            <CardContent sx={{ p: 0 }}>
              <List dense>
                {realtimeUpdates.length > 0 ? (
                  realtimeUpdates.map((activity, index) => (
                    <ListItem key={activity.id} divider={index < realtimeUpdates.length - 1}>
                      <ListItemIcon>
                        {activity.type === 'sale' ? (
                          <ShoppingCart color="success" />
                        ) : activity.type === 'inventory' ? (
                          <Warning color="warning" />
                        ) : activity.type === 'user' ? (
                          <People color="primary" />
                        ) : (
                          <Assignment color="info" />
                        )}
                      </ListItemIcon>
                      <ListItemText
                        primary={activity.title}
                        secondary={
                          <Box>
                            <Typography variant="body2" color="textSecondary">
                              {activity.description}
                            </Typography>
                            <Typography variant="caption" color="textSecondary">
                              {format(new Date(activity.timestamp), 'MMM dd, HH:mm')}
                            </Typography>
                          </Box>
                        }
                      />
                      {activity.amount && (
                        <Typography variant="body2" color="success.main" fontWeight="bold">
                          ${activity.amount}
                        </Typography>
                      )}
                    </ListItem>
                  ))
                ) : (
                  <ListItem>
                    <ListItemText
                      primary="No recent activity"
                      secondary="Activity will appear here in real-time"
                    />
                  </ListItem>
                )}
              </List>
            </CardContent>
          </Card>
        </Grid>

        {/* Top Products */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardHeader title="Top Selling Products" subheader="Best performers this period" />
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <RechartsBarChart data={topProductsData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <RechartsTooltip />
                  <Bar dataKey="sales" fill="#8884d8" />
                </RechartsBarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </Grid>

        {/* Category Distribution */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardHeader title="Product Categories" subheader="Distribution by category" />
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <RechartsPieChart>
                  <Pie
                    data={categoryData}
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    dataKey="value"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  >
                    {categoryData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <RechartsTooltip />
                </RechartsPieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </Grid>

        {/* Inventory Alerts */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardHeader
              title="Inventory Alerts"
              subheader="Products requiring attention"
              avatar={<Warning color="warning" />}
            />
            <CardContent>
              {inventoryData?.lowStockItems?.length > 0 ? (
                <List dense>
                  {inventoryData.lowStockItems.slice(0, 5).map((item: any) => (
                    <ListItem key={item.id}>
                      <ListItemIcon>
                        <Warning color={item.currentStock === 0 ? 'error' : 'warning'} />
                      </ListItemIcon>
                      <ListItemText
                        primary={item.name}
                        secondary={`Stock: ${item.currentStock} / Min: ${item.minStock}`}
                      />
                      <Chip
                        label={item.currentStock === 0 ? 'Out of Stock' : 'Low Stock'}
                        color={item.currentStock === 0 ? 'error' : 'warning'}
                        size="small"
                      />
                    </ListItem>
                  ))}
                </List>
              ) : (
                <Box sx={{ textAlign: 'center', py: 3 }}>
                  <CheckCircle color="success" sx={{ fontSize: 48, mb: 1 }} />
                  <Typography variant="h6">All Good!</Typography>
                  <Typography color="textSecondary">
                    No inventory alerts at the moment
                  </Typography>
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Quick Actions */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardHeader title="Quick Actions" subheader="Common tasks and shortcuts" />
            <CardContent>
              <Grid container spacing={2}>
                <Grid item xs={6}>
                  <Button
                    fullWidth
                    variant="outlined"
                    startIcon={<Add />}
                    onClick={() => {/* Navigate to add product */}}
                  >
                    Add Product
                  </Button>
                </Grid>
                <Grid item xs={6}>
                  <Button
                    fullWidth
                    variant="outlined"
                    startIcon={<ShoppingCart />}
                    onClick={() => {/* Navigate to POS */}}
                  >
                    New Sale
                  </Button>
                </Grid>
                <Grid item xs={6}>
                  <Button
                    fullWidth
                    variant="outlined"
                    startIcon={<Assessment />}
                    onClick={() => {/* Navigate to reports */}}
                  >
                    View Reports
                  </Button>
                </Grid>
                <Grid item xs={6}>
                  <Button
                    fullWidth
                    variant="outlined"
                    startIcon={<People />}
                    onClick={() => {/* Navigate to users */}}
                  >
                    Manage Users
                  </Button>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Options Menu */}
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={() => setAnchorEl(null)}
      >
        <MenuItem onClick={() => { setDateRange('7d'); setAnchorEl(null); }}>
          Last 7 days
        </MenuItem>
        <MenuItem onClick={() => { setDateRange('30d'); setAnchorEl(null); }}>
          Last 30 days
        </MenuItem>
        <MenuItem onClick={() => { setDateRange('90d'); setAnchorEl(null); }}>
          Last 90 days
        </MenuItem>
      </Menu>
    </Box>
  );
};

export default AdminDashboard;