import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Box,
  Grid,
  Paper,
  Typography,
  TextField,
  Button,
  IconButton,
  Card,
  CardContent,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  Snackbar,
  Divider,
  Tooltip,
  Badge,
  Fab,
  SpeedDial,
  SpeedDialAction,
  SpeedDialIcon
} from '@mui/material';
import {
  Add as AddIcon,
  Remove as RemoveIcon,
  Delete as DeleteIcon,
  Receipt as ReceiptIcon,
  Payment as PaymentIcon,
  Search as SearchIcon,
  QrCode as QrCodeIcon,
  Keyboard as KeyboardIcon,
  Settings as SettingsIcon,
  Print as PrintIcon,
  Drawer as DrawerIcon,
  Close as CloseIcon,
  Check as CheckIcon,
  Cancel as CancelIcon,
  Save as SaveIcon,
  Refresh as RefreshIcon,
  LocalOffer as DiscountIcon,
  Person as CustomerIcon,
  Inventory as InventoryIcon
} from '@mui/icons-material';
import { useTheme } from '@mui/material/styles';
import posHardware from '../../services/posHardware';

const POSInterface = () => {
  const theme = useTheme();
  const [cart, setCart] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [products, setProducts] = useState([]);
  const [filteredProducts, setFilteredProducts] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [customer, setCustomer] = useState(null);
  const [paymentDialog, setPaymentDialog] = useState(false);
  const [receiptDialog, setReceiptDialog] = useState(false);
  const [settingsDialog, setSettingsDialog] = useState(false);
  const [hardwareStatus, setHardwareStatus] = useState({});
  const [notification, setNotification] = useState({ show: false, message: '', type: 'info' });
  const [isScanning, setIsScanning] = useState(false);
  const [keyboardMode, setKeyboardMode] = useState(false);
  const [quickActions, setQuickActions] = useState([]);
  
  const searchRef = useRef(null);
  const barcodeRef = useRef('');

  // Calculate totals
  const subtotal = cart.reduce((sum, item) => sum + (item.quantity * item.price), 0);
  const tax = subtotal * 0.1; // 10% tax
  const total = subtotal + tax;

  // Load products
  useEffect(() => {
    loadProducts();
    setupHardware();
    setupKeyboardShortcuts();
  }, []);

  // Filter products based on search
  useEffect(() => {
    if (searchTerm.trim() === '') {
      setFilteredProducts(products.slice(0, 20)); // Show first 20 products
    } else {
      const filtered = products.filter(product =>
        product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        product.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
        product.barcode === searchTerm
      );
      setFilteredProducts(filtered);
    }
  }, [searchTerm, products]);

  // Hardware event listeners
  useEffect(() => {
    const handleBarcodeScanned = (barcode) => {
      handleBarcodeScan(barcode);
    };

    const handleHardwareStatus = (status) => {
      setHardwareStatus(status);
    };

    posHardware.on('barcodeScanned', handleBarcodeScanned);
    posHardware.on('statusUpdated', handleHardwareStatus);

    return () => {
      posHardware.off('barcodeScanned', handleBarcodeScanned);
      posHardware.off('statusUpdated', handleHardwareStatus);
    };
  }, []);

  const loadProducts = async () => {
    try {
      const response = await fetch('/api/products?limit=100');
      const data = await response.json();
      setProducts(data.products || []);
    } catch (error) {
      showNotification('Failed to load products', 'error');
    }
  };

  const setupHardware = async () => {
    try {
      const status = posHardware.getHardwareStatus();
      setHardwareStatus(status);
    } catch (error) {
      console.error('Hardware setup failed:', error);
    }
  };

  const setupKeyboardShortcuts = () => {
    const handleKeyPress = (event) => {
      // F1 - Focus search
      if (event.key === 'F1') {
        event.preventDefault();
        searchRef.current?.focus();
      }
      // F2 - Add to cart
      else if (event.key === 'F2' && selectedProduct) {
        event.preventDefault();
        addToCart(selectedProduct);
      }
      // F3 - Remove from cart
      else if (event.key === 'F3' && cart.length > 0) {
        event.preventDefault();
        removeFromCart(cart[cart.length - 1].id);
      }
      // F4 - Payment
      else if (event.key === 'F4') {
        event.preventDefault();
        handlePayment();
      }
      // F5 - Print receipt
      else if (event.key === 'F5') {
        event.preventDefault();
        printReceipt();
      }
      // F6 - Open cash drawer
      else if (event.key === 'F6') {
        event.preventDefault();
        openCashDrawer();
      }
      // F7 - Toggle keyboard mode
      else if (event.key === 'F7') {
        event.preventDefault();
        setKeyboardMode(!keyboardMode);
      }
      // Enter - Add selected product to cart
      else if (event.key === 'Enter' && selectedProduct) {
        event.preventDefault();
        addToCart(selectedProduct);
      }
      // Escape - Clear search
      else if (event.key === 'Escape') {
        event.preventDefault();
        setSearchTerm('');
        setSelectedProduct(null);
      }
    };

    document.addEventListener('keydown', handleKeyPress);
    return () => document.removeEventListener('keydown', handleKeyPress);
  };

  const handleBarcodeScan = (barcode) => {
    const product = products.find(p => p.barcode === barcode);
    if (product) {
      addToCart(product);
      showNotification(`Product scanned: ${product.name}`, 'success');
    } else {
      showNotification('Product not found', 'error');
    }
  };

  const addToCart = (product) => {
    const existingItem = cart.find(item => item.id === product.id);
    
    if (existingItem) {
      setCart(cart.map(item =>
        item.id === product.id
          ? { ...item, quantity: item.quantity + 1 }
          : item
      ));
    } else {
      setCart([...cart, {
        id: product.id,
        name: product.name,
        price: product.sellingPrice,
        quantity: 1,
        sku: product.sku
      }]);
    }
    
    showNotification(`${product.name} added to cart`, 'success');
  };

  const removeFromCart = (itemId) => {
    setCart(cart.filter(item => item.id !== itemId));
  };

  const updateQuantity = (itemId, quantity) => {
    if (quantity <= 0) {
      removeFromCart(itemId);
    } else {
      setCart(cart.map(item =>
        item.id === itemId
          ? { ...item, quantity }
          : item
      ));
    }
  };

  const handlePayment = () => {
    if (cart.length === 0) {
      showNotification('Cart is empty', 'warning');
      return;
    }
    setPaymentDialog(true);
  };

  const processPayment = async (paymentMethod, amount) => {
    try {
      // Process payment logic here
      const sale = {
        items: cart,
        total,
        paymentMethod,
        amount
      };

      // Open cash drawer if cash payment
      if (paymentMethod === 'CASH') {
        await openCashDrawer();
      }

      // Print receipt
      await printReceipt(sale);

      // Clear cart
      setCart([]);
      setPaymentDialog(false);
      
      showNotification('Payment processed successfully', 'success');
    } catch (error) {
      showNotification('Payment failed', 'error');
    }
  };

  const printReceipt = async (sale) => {
    try {
      const receiptData = {
        companyName: 'Enterprise ERP',
        companyAddress: '123 Business St, City, State 12345',
        companyPhone: '+1 (555) 123-4567',
        receiptNumber: `R${Date.now()}`,
        date: new Date().toLocaleString(),
        cashier: 'Current User',
        items: cart,
        subtotal,
        tax,
        total
      };

      await posHardware.printReceipt(receiptData);
      showNotification('Receipt printed', 'success');
    } catch (error) {
      showNotification('Failed to print receipt', 'error');
    }
  };

  const openCashDrawer = async () => {
    try {
      await posHardware.openCashDrawer();
      showNotification('Cash drawer opened', 'success');
    } catch (error) {
      showNotification('Failed to open cash drawer', 'error');
    }
  };

  const showNotification = (message, type = 'info') => {
    setNotification({ show: true, message, type });
  };

  const handleProductSelect = (product) => {
    setSelectedProduct(product);
    addToCart(product);
  };

  const clearCart = () => {
    setCart([]);
    showNotification('Cart cleared', 'info');
  };

  const handleSearchChange = (event) => {
    setSearchTerm(event.target.value);
  };

  const handleSearchKeyPress = (event) => {
    if (event.key === 'Enter' && filteredProducts.length > 0) {
      handleProductSelect(filteredProducts[0]);
      setSearchTerm('');
    }
  };

  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <Paper elevation={2} sx={{ p: 2, mb: 2 }}>
        <Grid container alignItems="center" spacing={2}>
          <Grid item xs={12} md={6}>
            <Typography variant="h4" component="h1" color="primary">
              Point of Sale
            </Typography>
          </Grid>
          <Grid item xs={12} md={6}>
            <Box display="flex" justifyContent="flex-end" gap={1}>
              <Chip
                icon={<QrCodeIcon />}
                label={hardwareStatus.connected ? 'Hardware Connected' : 'Hardware Disconnected'}
                color={hardwareStatus.connected ? 'success' : 'error'}
                size="small"
              />
              <Chip
                icon={<KeyboardIcon />}
                label={keyboardMode ? 'Keyboard Mode ON' : 'Keyboard Mode OFF'}
                color={keyboardMode ? 'primary' : 'default'}
                size="small"
              />
            </Box>
          </Grid>
        </Grid>
      </Paper>

      <Box sx={{ flex: 1, display: 'flex', gap: 2 }}>
        {/* Left Panel - Products */}
        <Paper elevation={2} sx={{ flex: 1, p: 2, display: 'flex', flexDirection: 'column' }}>
          <Typography variant="h6" gutterBottom>
            Products
          </Typography>
          
          {/* Search Bar */}
          <TextField
            ref={searchRef}
            fullWidth
            variant="outlined"
            placeholder="Search products, scan barcode, or press F1..."
            value={searchTerm}
            onChange={handleSearchChange}
            onKeyPress={handleSearchKeyPress}
            InputProps={{
              startAdornment: <SearchIcon sx={{ mr: 1, color: 'text.secondary' }} />
            }}
            sx={{ mb: 2 }}
          />

          {/* Product Grid */}
          <Box sx={{ flex: 1, overflow: 'auto' }}>
            <Grid container spacing={2}>
              {filteredProducts.map((product) => (
                <Grid item xs={12} sm={6} md={4} lg={3} key={product.id}>
                  <Card
                    sx={{
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      '&:hover': {
                        transform: 'translateY(-2px)',
                        boxShadow: theme.shadows[8]
                      }
                    }}
                    onClick={() => handleProductSelect(product)}
                  >
                    <CardContent>
                      <Typography variant="h6" noWrap>
                        {product.name}
                      </Typography>
                      <Typography variant="body2" color="text.secondary" noWrap>
                        SKU: {product.sku}
                      </Typography>
                      <Typography variant="h6" color="primary" sx={{ mt: 1 }}>
                        ${parseFloat(product.sellingPrice).toFixed(2)}
                      </Typography>
                      <Chip
                        label={`Stock: ${product.stockQuantity}`}
                        color={product.stockQuantity > 10 ? 'success' : 'warning'}
                        size="small"
                        sx={{ mt: 1 }}
                      />
                    </CardContent>
                  </Card>
                </Grid>
              ))}
            </Grid>
          </Box>
        </Paper>

        {/* Right Panel - Cart */}
        <Paper elevation={2} sx={{ width: 400, p: 2, display: 'flex', flexDirection: 'column' }}>
          <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
            <Typography variant="h6">
              Cart ({cart.length} items)
            </Typography>
            <IconButton onClick={clearCart} color="error" size="small">
              <DeleteIcon />
            </IconButton>
          </Box>

          {/* Cart Items */}
          <Box sx={{ flex: 1, overflow: 'auto', mb: 2 }}>
            {cart.length === 0 ? (
              <Typography variant="body2" color="text.secondary" textAlign="center">
                Cart is empty
              </Typography>
            ) : (
              <List>
                {cart.map((item) => (
                  <ListItem key={item.id} divider>
                    <ListItemText
                      primary={item.name}
                      secondary={`$${parseFloat(item.price).toFixed(2)} each`}
                    />
                    <ListItemSecondaryAction>
                      <Box display="flex" alignItems="center" gap={1}>
                        <IconButton
                          size="small"
                          onClick={() => updateQuantity(item.id, item.quantity - 1)}
                        >
                          <RemoveIcon />
                        </IconButton>
                        <Typography variant="body2" sx={{ minWidth: 30, textAlign: 'center' }}>
                          {item.quantity}
                        </Typography>
                        <IconButton
                          size="small"
                          onClick={() => updateQuantity(item.id, item.quantity + 1)}
                        >
                          <AddIcon />
                        </IconButton>
                        <Typography variant="body2" sx={{ minWidth: 60, textAlign: 'right' }}>
                          ${(item.quantity * item.price).toFixed(2)}
                        </Typography>
                      </Box>
                    </ListItemSecondaryAction>
                  </ListItem>
                ))}
              </List>
            )}
          </Box>

          {/* Totals */}
          <Divider sx={{ my: 2 }} />
          <Box>
            <Box display="flex" justifyContent="space-between" mb={1}>
              <Typography>Subtotal:</Typography>
              <Typography>${subtotal.toFixed(2)}</Typography>
            </Box>
            <Box display="flex" justifyContent="space-between" mb={1}>
              <Typography>Tax (10%):</Typography>
              <Typography>${tax.toFixed(2)}</Typography>
            </Box>
            <Divider sx={{ my: 1 }} />
            <Box display="flex" justifyContent="space-between" mb={2}>
              <Typography variant="h6">Total:</Typography>
              <Typography variant="h6" color="primary">
                ${total.toFixed(2)}
              </Typography>
            </Box>
          </Box>

          {/* Action Buttons */}
          <Box display="flex" gap={1}>
            <Button
              variant="outlined"
              startIcon={<CustomerIcon />}
              fullWidth
              onClick={() => {/* Customer selection logic */}}
            >
              Customer
            </Button>
            <Button
              variant="outlined"
              startIcon={<DiscountIcon />}
              fullWidth
              onClick={() => {/* Discount logic */}}
            >
              Discount
            </Button>
          </Box>
          
          <Button
            variant="contained"
            size="large"
            startIcon={<PaymentIcon />}
            fullWidth
            sx={{ mt: 2 }}
            onClick={handlePayment}
            disabled={cart.length === 0}
          >
            PAY ${total.toFixed(2)}
          </Button>
        </Paper>
      </Box>

      {/* Speed Dial for Quick Actions */}
      <SpeedDial
        ariaLabel="Quick actions"
        sx={{ position: 'absolute', bottom: 16, right: 16 }}
        icon={<SpeedDialIcon />}
      >
        <SpeedDialAction
          icon={<ReceiptIcon />}
          tooltipTitle="Print Receipt"
          onClick={() => printReceipt()}
        />
        <SpeedDialAction
          icon={<DrawerIcon />}
          tooltipTitle="Open Cash Drawer"
          onClick={openCashDrawer}
        />
        <SpeedDialAction
          icon={<SettingsIcon />}
          tooltipTitle="Settings"
          onClick={() => setSettingsDialog(true)}
        />
        <SpeedDialAction
          icon={<RefreshIcon />}
          tooltipTitle="Refresh"
          onClick={loadProducts}
        />
      </SpeedDial>

      {/* Payment Dialog */}
      <PaymentDialog
        open={paymentDialog}
        onClose={() => setPaymentDialog(false)}
        total={total}
        onPayment={processPayment}
      />

      {/* Receipt Dialog */}
      <ReceiptDialog
        open={receiptDialog}
        onClose={() => setReceiptDialog(false)}
        sale={{ items: cart, total }}
      />

      {/* Settings Dialog */}
      <SettingsDialog
        open={settingsDialog}
        onClose={() => setSettingsDialog(false)}
        hardwareStatus={hardwareStatus}
      />

      {/* Notifications */}
      <Snackbar
        open={notification.show}
        autoHideDuration={3000}
        onClose={() => setNotification({ ...notification, show: false })}
      >
        <Alert severity={notification.type} onClose={() => setNotification({ ...notification, show: false })}>
          {notification.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

// Payment Dialog Component
const PaymentDialog = ({ open, onClose, total, onPayment }) => {
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [amount, setAmount] = useState('');

  const handlePayment = () => {
    onPayment(paymentMethod, parseFloat(amount));
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Payment</DialogTitle>
      <DialogContent>
        <Box sx={{ mb: 2 }}>
          <Typography variant="h6" gutterBottom>
            Total: ${total.toFixed(2)}
          </Typography>
        </Box>
        
        <TextField
          select
          fullWidth
          label="Payment Method"
          value={paymentMethod}
          onChange={(e) => setPaymentMethod(e.target.value)}
          sx={{ mb: 2 }}
        >
          <option value="CASH">Cash</option>
          <option value="CARD">Card</option>
          <option value="BANK_TRANSFER">Bank Transfer</option>
          <option value="MOBILE_MONEY">Mobile Money</option>
        </TextField>
        
        <TextField
          fullWidth
          label="Amount Received"
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          sx={{ mb: 2 }}
        />
        
        {amount && (
          <Typography variant="body2" color="text.secondary">
            Change: ${(parseFloat(amount) - total).toFixed(2)}
          </Typography>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handlePayment} variant="contained">
          Process Payment
        </Button>
      </DialogActions>
    </Dialog>
  );
};

// Receipt Dialog Component
const ReceiptDialog = ({ open, onClose, sale }) => {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Receipt</DialogTitle>
      <DialogContent>
        <Typography variant="h6" gutterBottom>
          Enterprise ERP
        </Typography>
        <Typography variant="body2" color="text.secondary" gutterBottom>
          123 Business St, City, State 12345
        </Typography>
        <Typography variant="body2" color="text.secondary" gutterBottom>
          Phone: +1 (555) 123-4567
        </Typography>
        
        <Divider sx={{ my: 2 }} />
        
        {sale.items.map((item) => (
          <Box key={item.id} display="flex" justifyContent="space-between" mb={1}>
            <Typography>{item.name} x{item.quantity}</Typography>
            <Typography>${(item.quantity * item.price).toFixed(2)}</Typography>
          </Box>
        ))}
        
        <Divider sx={{ my: 2 }} />
        
        <Box display="flex" justifyContent="space-between">
          <Typography variant="h6">Total:</Typography>
          <Typography variant="h6">${sale.total.toFixed(2)}</Typography>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
        <Button startIcon={<PrintIcon />} variant="contained">
          Print Receipt
        </Button>
      </DialogActions>
    </Dialog>
  );
};

// Settings Dialog Component
const SettingsDialog = ({ open, onClose, hardwareStatus }) => {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>POS Settings</DialogTitle>
      <DialogContent>
        <Typography variant="h6" gutterBottom>
          Hardware Status
        </Typography>
        <Box display="flex" flexDirection="column" gap={1}>
          <Chip
            label={`USB Device: ${hardwareStatus.devices?.usb ? 'Connected' : 'Disconnected'}`}
            color={hardwareStatus.devices?.usb ? 'success' : 'error'}
          />
          <Chip
            label={`Serial Port: ${hardwareStatus.devices?.serial ? 'Connected' : 'Disconnected'}`}
            color={hardwareStatus.devices?.serial ? 'success' : 'error'}
          />
          <Chip
            label={`Printer: ${hardwareStatus.devices?.printer ? 'Connected' : 'Disconnected'}`}
            color={hardwareStatus.devices?.printer ? 'success' : 'error'}
          />
          <Chip
            label={`Cash Drawer: ${hardwareStatus.devices?.cashDrawer ? 'Connected' : 'Disconnected'}`}
            color={hardwareStatus.devices?.cashDrawer ? 'success' : 'error'}
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
};

export default POSInterface;