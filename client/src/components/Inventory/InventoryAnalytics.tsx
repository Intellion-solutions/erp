import React, { useState, useEffect } from 'react';
import {
  Box,
  Grid,
  Paper,
  Typography,
  Card,
  CardContent,
  CardHeader,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Avatar,
  CircularProgress,
  Alert,
  Divider,
  LinearProgress
} from '@mui/material';
import {
  TrendingUp,
  TrendingDown,
  Inventory,
  Warning,
  CheckCircle,
  AttachMoney,
  Assessment,
  Timeline,
  PieChart,
  BarChart,
  ShowChart,
  Category,
  Speed,
  AccountBalance,
  LocalShipping,
  Store
} from '@mui/icons-material';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart as RechartsBarChart,
  Bar,
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  ComposedChart
} from 'recharts';
import { useQuery } from 'react-query';
import { format, subDays, subMonths } from 'date-fns';

import { reportsApi, productsApi } from '../../services/api';

const COLORS = ['#8884d8', '#82ca9d', '#ffc658', '#ff7300', '#8dd1e1', '#d084d0', '#ffb347'];

interface InventoryMetric {
  title: string;
  value: string | number;
  change?: number;
  icon: React.ReactNode;
  color: string;
  trend?: 'up' | 'down' | 'neutral';
  subtitle?: string;
}

const InventoryAnalytics: React.FC = () => {
  const [timeRange, setTimeRange] = useState('30d');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [viewType, setViewType] = useState('overview');

  // Calculate date range
  const getDateRange = () => {
    const end = new Date();
    let start = new Date();
    
    switch (timeRange) {
      case '7d':
        start = subDays(end, 7);
        break;
      case '30d':
        start = subDays(end, 30);
        break;
      case '90d':
        start = subDays(end, 90);
        break;
      case '6m':
        start = subMonths(end, 6);
        break;
      case '1y':
        start = subMonths(end, 12);
        break;
      default:
        start = subDays(end, 30);
    }

    return {
      startDate: format(start, 'yyyy-MM-dd'),
      endDate: format(end, 'yyyy-MM-dd')
    };
  };

  // Queries
  const { data: inventoryStats, isLoading } = useQuery(
    ['inventory-analytics', timeRange, selectedCategory],
    () => reportsApi.getInventoryAnalytics({
      ...getDateRange(),
      category: selectedCategory !== 'all' ? selectedCategory : undefined
    }),
    { keepPreviousData: true }
  );

  const { data: movementData } = useQuery(
    ['stock-movements', timeRange],
    () => reportsApi.getStockMovements(getDateRange()),
    { keepPreviousData: true }
  );

  const { data: categoriesData } = useQuery(
    'categories',
    () => productsApi.getCategories()
  );

  const { data: turnoverData } = useQuery(
    ['inventory-turnover', timeRange],
    () => reportsApi.getInventoryTurnover(getDateRange()),
    { keepPreviousData: true }
  );

  // Key metrics
  const metrics: InventoryMetric[] = inventoryStats ? [
    {
      title: 'Total Products',
      value: inventoryStats.totalProducts || 0,
      change: inventoryStats.productsGrowth,
      icon: <Inventory />,
      color: '#2196f3',
      trend: (inventoryStats.productsGrowth || 0) >= 0 ? 'up' : 'down',
      subtitle: 'Active products'
    },
    {
      title: 'Inventory Value',
      value: `$${(inventoryStats.totalValue || 0).toLocaleString()}`,
      change: inventoryStats.valueGrowth,
      icon: <AttachMoney />,
      color: '#4caf50',
      trend: (inventoryStats.valueGrowth || 0) >= 0 ? 'up' : 'down',
      subtitle: 'Current stock value'
    },
    {
      title: 'Avg Turnover Rate',
      value: `${(inventoryStats.avgTurnoverRate || 0).toFixed(1)}x`,
      change: inventoryStats.turnoverGrowth,
      icon: <Speed />,
      color: '#ff9800',
      trend: (inventoryStats.turnoverGrowth || 0) >= 0 ? 'up' : 'down',
      subtitle: 'Times per period'
    },
    {
      title: 'Low Stock Items',
      value: inventoryStats.lowStockCount || 0,
      icon: <Warning />,
      color: '#f44336',
      subtitle: 'Require attention'
    },
    {
      title: 'Out of Stock',
      value: inventoryStats.outOfStockCount || 0,
      icon: <Store />,
      color: '#9c27b0',
      subtitle: 'Need restocking'
    },
    {
      title: 'Profit Margin',
      value: `${(inventoryStats.avgProfitMargin || 0).toFixed(1)}%`,
      change: inventoryStats.marginGrowth,
      icon: <AccountBalance />,
      color: '#009688',
      trend: (inventoryStats.marginGrowth || 0) >= 0 ? 'up' : 'down',
      subtitle: 'Average margin'
    }
  ] : [];

  // Stock movement trend data
  const movementTrendData = movementData?.dailyMovements?.map((item: any) => ({
    date: format(new Date(item.date), 'MMM dd'),
    inbound: item.inbound,
    outbound: item.outbound,
    adjustments: item.adjustments
  })) || [];

  // Category performance data
  const categoryPerformanceData = inventoryStats?.categoryAnalysis?.map((item: any, index: number) => ({
    category: item.categoryName,
    products: item.productCount,
    value: item.totalValue,
    turnover: item.turnoverRate,
    margin: item.profitMargin,
    color: COLORS[index % COLORS.length]
  })) || [];

  // ABC Analysis data
  const abcAnalysisData = inventoryStats?.abcAnalysis ? [
    { name: 'A Items (High Value)', value: inventoryStats.abcAnalysis.aItems, fill: '#4caf50' },
    { name: 'B Items (Medium Value)', value: inventoryStats.abcAnalysis.bItems, fill: '#ff9800' },
    { name: 'C Items (Low Value)', value: inventoryStats.abcAnalysis.cItems, fill: '#f44336' }
  ] : [];

  // Top performing products
  const topProducts = inventoryStats?.topPerformingProducts?.slice(0, 10) || [];

  // Slow moving products
  const slowMovingProducts = inventoryStats?.slowMovingProducts?.slice(0, 10) || [];

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 400 }}>
        <CircularProgress size={60} />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      {/* Controls */}
      <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
        <FormControl variant="outlined" sx={{ minWidth: 120 }}>
          <InputLabel>Time Range</InputLabel>
          <Select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value)}
            label="Time Range"
          >
            <MenuItem value="7d">Last 7 days</MenuItem>
            <MenuItem value="30d">Last 30 days</MenuItem>
            <MenuItem value="90d">Last 90 days</MenuItem>
            <MenuItem value="6m">Last 6 months</MenuItem>
            <MenuItem value="1y">Last year</MenuItem>
          </Select>
        </FormControl>

        <FormControl variant="outlined" sx={{ minWidth: 120 }}>
          <InputLabel>Category</InputLabel>
          <Select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            label="Category"
          >
            <MenuItem value="all">All Categories</MenuItem>
            {categoriesData?.categories?.map((category: any) => (
              <MenuItem key={category.id} value={category.id}>
                {category.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <FormControl variant="outlined" sx={{ minWidth: 120 }}>
          <InputLabel>View</InputLabel>
          <Select
            value={viewType}
            onChange={(e) => setViewType(e.target.value)}
            label="View"
          >
            <MenuItem value="overview">Overview</MenuItem>
            <MenuItem value="movements">Stock Movements</MenuItem>
            <MenuItem value="performance">Performance</MenuItem>
            <MenuItem value="abc">ABC Analysis</MenuItem>
          </Select>
        </FormControl>
      </Box>

      {/* Key Metrics */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        {metrics.map((metric, index) => (
          <Grid item xs={12} sm={6} md={4} lg={2} key={index}>
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Box sx={{ flex: 1 }}>
                    <Typography color="textSecondary" variant="body2" gutterBottom>
                      {metric.title}
                    </Typography>
                    <Typography variant="h6" fontWeight="bold">
                      {metric.value}
                    </Typography>
                    <Typography variant="caption" color="textSecondary">
                      {metric.subtitle}
                    </Typography>
                    {metric.change !== undefined && (
                      <Box sx={{ display: 'flex', alignItems: 'center', mt: 0.5 }}>
                        {metric.trend === 'up' ? (
                          <TrendingUp sx={{ color: 'success.main', fontSize: 14, mr: 0.5 }} />
                        ) : metric.trend === 'down' ? (
                          <TrendingDown sx={{ color: 'error.main', fontSize: 14, mr: 0.5 }} />
                        ) : null}
                        <Typography
                          variant="caption"
                          color={
                            metric.trend === 'up'
                              ? 'success.main'
                              : metric.trend === 'down'
                              ? 'error.main'
                              : 'textSecondary'
                          }
                        >
                          {Math.abs(metric.change).toFixed(1)}%
                        </Typography>
                      </Box>
                    )}
                  </Box>
                  <Avatar sx={{ bgcolor: metric.color, width: 40, height: 40 }}>
                    {metric.icon}
                  </Avatar>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Main Content based on view type */}
      {viewType === 'overview' && (
        <Grid container spacing={3}>
          {/* Stock Movement Trends */}
          <Grid item xs={12} lg={8}>
            <Card>
              <CardHeader title="Stock Movement Trends" subheader="Daily inventory movements" />
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <ComposedChart data={movementTrendData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Area
                      type="monotone"
                      dataKey="inbound"
                      stackId="1"
                      stroke="#4caf50"
                      fill="#4caf50"
                      fillOpacity={0.6}
                    />
                    <Area
                      type="monotone"
                      dataKey="outbound"
                      stackId="2"
                      stroke="#f44336"
                      fill="#f44336"
                      fillOpacity={0.6}
                    />
                    <Line
                      type="monotone"
                      dataKey="adjustments"
                      stroke="#ff9800"
                      strokeWidth={2}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </Grid>

          {/* ABC Analysis */}
          <Grid item xs={12} lg={4}>
            <Card>
              <CardHeader title="ABC Analysis" subheader="Inventory classification" />
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <RechartsPieChart>
                    <Pie
                      data={abcAnalysisData}
                      cx="50%"
                      cy="50%"
                      outerRadius={100}
                      dataKey="value"
                      label={({ name, percent }) => `${(percent * 100).toFixed(0)}%`}
                    >
                      {abcAnalysisData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </RechartsPieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </Grid>

          {/* Category Performance */}
          <Grid item xs={12}>
            <Card>
              <CardHeader title="Category Performance" subheader="Performance metrics by category" />
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <RechartsBarChart data={categoryPerformanceData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="category" />
                    <YAxis yAxisId="left" orientation="left" />
                    <YAxis yAxisId="right" orientation="right" />
                    <Tooltip />
                    <Legend />
                    <Bar yAxisId="left" dataKey="value" fill="#8884d8" name="Total Value ($)" />
                    <Bar yAxisId="right" dataKey="turnover" fill="#82ca9d" name="Turnover Rate" />
                  </RechartsBarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {viewType === 'performance' && (
        <Grid container spacing={3}>
          {/* Top Performing Products */}
          <Grid item xs={12} md={6}>
            <Card>
              <CardHeader
                title="Top Performing Products"
                subheader="Best sellers by revenue"
                avatar={<TrendingUp color="success" />}
              />
              <CardContent sx={{ p: 0 }}>
                <List dense>
                  {topProducts.map((product: any, index: number) => (
                    <ListItem key={product.id} divider={index < topProducts.length - 1}>
                      <ListItemIcon>
                        <Avatar sx={{ bgcolor: COLORS[index % COLORS.length], width: 32, height: 32 }}>
                          {index + 1}
                        </Avatar>
                      </ListItemIcon>
                      <ListItemText
                        primary={product.name}
                        secondary={
                          <Box>
                            <Typography variant="body2" color="textSecondary">
                              Revenue: ${product.revenue?.toLocaleString()} • 
                              Sold: {product.quantitySold} • 
                              Turnover: {product.turnoverRate?.toFixed(1)}x
                            </Typography>
                            <LinearProgress
                              variant="determinate"
                              value={Math.min((product.revenue / topProducts[0]?.revenue) * 100, 100)}
                              sx={{ mt: 1, height: 4, borderRadius: 2 }}
                            />
                          </Box>
                        }
                      />
                      <Typography variant="body2" color="success.main" fontWeight="bold">
                        ${product.revenue?.toLocaleString()}
                      </Typography>
                    </ListItem>
                  ))}
                </List>
              </CardContent>
            </Card>
          </Grid>

          {/* Slow Moving Products */}
          <Grid item xs={12} md={6}>
            <Card>
              <CardHeader
                title="Slow Moving Products"
                subheader="Products with low turnover"
                avatar={<TrendingDown color="warning" />}
              />
              <CardContent sx={{ p: 0 }}>
                <List dense>
                  {slowMovingProducts.map((product: any, index: number) => (
                    <ListItem key={product.id} divider={index < slowMovingProducts.length - 1}>
                      <ListItemIcon>
                        <Warning color="warning" />
                      </ListItemIcon>
                      <ListItemText
                        primary={product.name}
                        secondary={
                          <Box>
                            <Typography variant="body2" color="textSecondary">
                              Stock: {product.currentStock} • 
                              Last Sale: {product.lastSaleDate ? format(new Date(product.lastSaleDate), 'MMM dd') : 'Never'} • 
                              Days in Stock: {product.daysInStock || 0}
                            </Typography>
                            <Chip
                              label={product.currentStock === 0 ? 'Out of Stock' : 'Slow Moving'}
                              color={product.currentStock === 0 ? 'error' : 'warning'}
                              size="small"
                              sx={{ mt: 1 }}
                            />
                          </Box>
                        }
                      />
                      <Typography variant="body2" color="textSecondary">
                        ${product.totalValue?.toFixed(0)}
                      </Typography>
                    </ListItem>
                  ))}
                </List>
              </CardContent>
            </Card>
          </Grid>

          {/* Inventory Turnover Trends */}
          <Grid item xs={12}>
            <Card>
              <CardHeader title="Inventory Turnover Trends" subheader="Turnover rate over time" />
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={turnoverData?.monthlyTurnover || []}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="turnoverRate"
                      stroke="#8884d8"
                      strokeWidth={3}
                      dot={{ r: 6 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="averageTurnover"
                      stroke="#82ca9d"
                      strokeDasharray="5 5"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {viewType === 'abc' && (
        <Grid container spacing={3}>
          {/* ABC Analysis Details */}
          <Grid item xs={12} md={8}>
            <Card>
              <CardHeader title="ABC Analysis Details" subheader="Detailed breakdown by category" />
              <CardContent>
                <Grid container spacing={3}>
                  <Grid item xs={12} md={4}>
                    <Box sx={{ textAlign: 'center', p: 2, bgcolor: 'success.light', borderRadius: 2 }}>
                      <Typography variant="h4" color="success.contrastText" fontWeight="bold">
                        {inventoryStats?.abcAnalysis?.aItems || 0}
                      </Typography>
                      <Typography variant="h6" color="success.contrastText">
                        A Items
                      </Typography>
                      <Typography variant="body2" color="success.contrastText">
                        High value, low quantity (80% of value)
                      </Typography>
                    </Box>
                  </Grid>
                  <Grid item xs={12} md={4}>
                    <Box sx={{ textAlign: 'center', p: 2, bgcolor: 'warning.light', borderRadius: 2 }}>
                      <Typography variant="h4" color="warning.contrastText" fontWeight="bold">
                        {inventoryStats?.abcAnalysis?.bItems || 0}
                      </Typography>
                      <Typography variant="h6" color="warning.contrastText">
                        B Items
                      </Typography>
                      <Typography variant="body2" color="warning.contrastText">
                        Medium value, medium quantity (15% of value)
                      </Typography>
                    </Box>
                  </Grid>
                  <Grid item xs={12} md={4}>
                    <Box sx={{ textAlign: 'center', p: 2, bgcolor: 'error.light', borderRadius: 2 }}>
                      <Typography variant="h4" color="error.contrastText" fontWeight="bold">
                        {inventoryStats?.abcAnalysis?.cItems || 0}
                      </Typography>
                      <Typography variant="h6" color="error.contrastText">
                        C Items
                      </Typography>
                      <Typography variant="body2" color="error.contrastText">
                        Low value, high quantity (5% of value)
                      </Typography>
                    </Box>
                  </Grid>
                </Grid>
              </CardContent>
            </Card>
          </Grid>

          {/* ABC Recommendations */}
          <Grid item xs={12} md={4}>
            <Card>
              <CardHeader title="Recommendations" subheader="Based on ABC analysis" />
              <CardContent>
                <List dense>
                  <ListItem>
                    <ListItemIcon>
                      <CheckCircle color="success" />
                    </ListItemIcon>
                    <ListItemText
                      primary="A Items"
                      secondary="Tight control, frequent monitoring, accurate forecasting"
                    />
                  </ListItem>
                  <ListItem>
                    <ListItemIcon>
                      <Assessment color="warning" />
                    </ListItemIcon>
                    <ListItemText
                      primary="B Items"
                      secondary="Moderate control, periodic review, economic order quantities"
                    />
                  </ListItem>
                  <ListItem>
                    <ListItemIcon>
                      <Inventory color="info" />
                    </ListItemIcon>
                    <ListItemText
                      primary="C Items"
                      secondary="Loose control, bulk ordering, simple systems"
                    />
                  </ListItem>
                </List>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {/* Additional Insights */}
      <Grid container spacing={3} sx={{ mt: 2 }}>
        <Grid item xs={12}>
          <Card>
            <CardHeader title="Key Insights" subheader="Automated analysis and recommendations" />
            <CardContent>
              <Grid container spacing={2}>
                {inventoryStats?.insights?.map((insight: any, index: number) => (
                  <Grid item xs={12} sm={6} md={4} key={index}>
                    <Alert
                      severity={insight.type}
                      icon={
                        insight.type === 'warning' ? <Warning /> :
                        insight.type === 'error' ? <TrendingDown /> :
                        insight.type === 'success' ? <TrendingUp /> :
                        <Assessment />
                      }
                    >
                      <Typography variant="subtitle2" fontWeight="bold">
                        {insight.title}
                      </Typography>
                      <Typography variant="body2">
                        {insight.description}
                      </Typography>
                    </Alert>
                  </Grid>
                ))}
              </Grid>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
};

export default InventoryAnalytics;