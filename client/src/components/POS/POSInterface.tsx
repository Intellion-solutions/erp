import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Box,
  Grid,
  Paper,
  Typography,
  TextField,
  Button,
  Card,
  CardContent,
  IconButton,
  Chip,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Divider,
  CircularProgress,
  Alert,
  Badge
} from '@mui/material';
import {
  ShoppingCart,
  Add,
  Remove,
  Delete,
  QrCodeScanner,
  Payment,
  Receipt,
  Person,
  Clear,
  Search,
  Inventory,
  Warning
} from '@mui/icons-material';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import toast from 'react-hot-toast';

import { posApi, customersApi } from '../../services/api';
import { useAuth } from '../../hooks/useAuth';
import { useSocket } from '../../hooks/useSocket';
import { Product, Sale, Customer, CartItem, PaymentMethod } from '../../types';
import BarcodeScanner from './BarcodeScanner';
import CustomerSelector from './CustomerSelector';
import PaymentDialog from './PaymentDialog';
import ReceiptPrint from './ReceiptPrint';

interface POSInterfaceProps {
  terminalId: string;
}

const POSInterface: React.FC<POSInterfaceProps> = ({ terminalId }) => {
  const { user } = useAuth();
  const { socket, isConnected } = useSocket();
  const queryClient = useQueryClient();

  // State
  const [cart, setCart] = useState<CartItem[]>([]);
  const [currentSale, setCurrentSale] = useState<Sale | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isPaymentOpen, setIsPaymentOpen] = useState(false);
  const [isReceiptOpen, setIsReceiptOpen] = useState(false);
  const [completedSale, setCompletedSale] = useState<Sale | null>(null);
  const [notes, setNotes] = useState('');

  // Refs
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Queries
  const { data: productsData, isLoading: isLoadingProducts } = useQuery(
    ['pos-products', searchQuery],
    () => posApi.getProducts({ search: searchQuery }),
    {
      enabled: searchQuery.length > 2 || searchQuery === '',
      keepPreviousData: true,
    }
  );

  // Mutations
  const startSaleMutation = useMutation(posApi.startSale, {
    onSuccess: (response) => {
      setCurrentSale(response.data.sale);
      toast.success('New sale started');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to start sale');
    },
  });

  const addItemMutation = useMutation(
    ({ saleId, item }: { saleId: string; item: any }) =>
      posApi.addItemToSale(saleId, item),
    {
      onSuccess: (response) => {
        setCurrentSale(response.data.sale);
        updateCartFromSale(response.data.sale);
        toast.success('Item added to cart');
      },
      onError: (error: any) => {
        toast.error(error.response?.data?.error || 'Failed to add item');
      },
    }
  );

  const removeItemMutation = useMutation(
    ({ saleId, itemId }: { saleId: string; itemId: string }) =>
      posApi.removeItemFromSale(saleId, itemId),
    {
      onSuccess: (response) => {
        setCurrentSale(response.data.sale);
        updateCartFromSale(response.data.sale);
        toast.success('Item removed from cart');
      },
      onError: (error: any) => {
        toast.error(error.response?.data?.error || 'Failed to remove item');
      },
    }
  );

  const completeSaleMutation = useMutation(
    ({ saleId, payment }: { saleId: string; payment: any }) =>
      posApi.completeSale(saleId, payment),
    {
      onSuccess: (response) => {
        setCompletedSale(response.data.sale);
        setIsPaymentOpen(false);
        setIsReceiptOpen(true);
        clearCart();
        toast.success('Sale completed successfully!');
      },
      onError: (error: any) => {
        toast.error(error.response?.data?.error || 'Failed to complete sale');
      },
    }
  );

  // Socket effects
  useEffect(() => {
    if (socket && isConnected) {
      // Register terminal
      socket.emit('register_terminal', terminalId);

      // Listen for real-time events
      socket.on('sale_item_added', (data) => {
        if (data.saleId === currentSale?.id && data.addedBy !== user?.id) {
          setCurrentSale(data.sale);
          updateCartFromSale(data.sale);
          toast.info('Item added by another terminal');
        }
      });

      socket.on('sale_item_removed', (data) => {
        if (data.saleId === currentSale?.id && data.removedBy !== user?.id) {
          setCurrentSale(data.sale);
          updateCartFromSale(data.sale);
          toast.info('Item removed by another terminal');
        }
      });

      socket.on('inventory_updated', (data) => {
        queryClient.invalidateQueries(['pos-products']);
        if (data.product.currentStock <= data.product.minStock) {
          toast.warning(`Low stock alert: ${data.product.name}`);
        }
      });

      return () => {
        socket.off('sale_item_added');
        socket.off('sale_item_removed');
        socket.off('inventory_updated');
      };
    }
  }, [socket, isConnected, currentSale, user, queryClient]);

  // Helper functions
  const updateCartFromSale = useCallback((sale: Sale) => {
    if (sale.items) {
      const cartItems: CartItem[] = sale.items.map(item => ({
        product: item.product!,
        quantity: item.quantity,
        discount: item.discount,
        subtotal: item.total
      }));
      setCart(cartItems);
    }
  }, []);

  const calculateTotals = useCallback(() => {
    const subtotal = cart.reduce((sum, item) => sum + item.subtotal, 0);
    const tax = cart.reduce((sum, item) => {
      const taxableAmount = item.subtotal - item.discount;
      return sum + (taxableAmount * item.product.taxRate / 100);
    }, 0);
    const total = subtotal + tax;

    return { subtotal, tax, total };
  }, [cart]);

  const startNewSale = useCallback(() => {
    startSaleMutation.mutate({
      customerId: selectedCustomer?.id,
      terminalId,
    });
  }, [selectedCustomer, terminalId, startSaleMutation]);

  const addProductToCart = useCallback((product: Product, quantity: number = 1) => {
    if (!currentSale) {
      startSaleMutation.mutate(
        { customerId: selectedCustomer?.id, terminalId },
        {
          onSuccess: (response) => {
            addItemMutation.mutate({
              saleId: response.data.sale.id,
              item: { productId: product.id, quantity }
            });
          }
        }
      );
    } else {
      addItemMutation.mutate({
        saleId: currentSale.id,
        item: { productId: product.id, quantity }
      });
    }
  }, [currentSale, selectedCustomer, terminalId, startSaleMutation, addItemMutation]);

  const removeFromCart = useCallback((productId: string) => {
    if (!currentSale) return;

    const saleItem = currentSale.items?.find(item => item.productId === productId);
    if (saleItem) {
      removeItemMutation.mutate({
        saleId: currentSale.id,
        itemId: saleItem.id
      });
    }
  }, [currentSale, removeItemMutation]);

  const clearCart = useCallback(() => {
    setCart([]);
    setCurrentSale(null);
    setSelectedCustomer(null);
    setNotes('');
  }, []);

  const handleBarcodeScanned = useCallback(async (barcode: string) => {
    try {
      const response = await posApi.getProductByIdentifier(barcode);
      const product = response.data.product;
      
      if (product.currentStock <= 0) {
        toast.error('Product is out of stock');
        return;
      }

      addProductToCart(product);
      setIsScannerOpen(false);
    } catch (error: any) {
      toast.error('Product not found');
    }
  }, [addProductToCart]);

  const handlePayment = useCallback((paymentData: any) => {
    if (!currentSale) return;

    completeSaleMutation.mutate({
      saleId: currentSale.id,
      payment: {
        ...paymentData,
        notes
      }
    });
  }, [currentSale, notes, completeSaleMutation]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey) {
        switch (event.key) {
          case 'n':
            event.preventDefault();
            if (!currentSale) startNewSale();
            break;
          case 'f':
            event.preventDefault();
            searchInputRef.current?.focus();
            break;
          case 's':
            event.preventDefault();
            setIsScannerOpen(true);
            break;
          case 'p':
            event.preventDefault();
            if (cart.length > 0) setIsPaymentOpen(true);
            break;
          case 'c':
            event.preventDefault();
            clearCart();
            break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [currentSale, cart.length, startNewSale, clearCart]);

  const totals = calculateTotals();

  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <Paper elevation={2} sx={{ p: 2, mb: 2 }}>
        <Grid container alignItems="center" justifyContent="space-between">
          <Grid item>
            <Typography variant="h5" component="h1">
              POS Terminal
              <Chip
                label={`Terminal ${terminalId}`}
                color="primary"
                size="small"
                sx={{ ml: 2 }}
              />
            </Typography>
          </Grid>
          <Grid item>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Badge
                color={isConnected ? 'success' : 'error'}
                variant="dot"
              >
                <Typography variant="body2">
                  {isConnected ? 'Online' : 'Offline'}
                </Typography>
              </Badge>
              <Typography variant="body2">
                {user?.firstName} {user?.lastName}
              </Typography>
            </Box>
          </Grid>
        </Grid>
      </Paper>

      <Grid container spacing={2} sx={{ flex: 1, overflow: 'hidden' }}>
        {/* Left Panel - Products */}
        <Grid item xs={12} md={8} sx={{ height: '100%' }}>
          <Paper sx={{ p: 2, height: '100%', display: 'flex', flexDirection: 'column' }}>
            {/* Search Bar */}
            <Box sx={{ mb: 2 }}>
              <TextField
                ref={searchInputRef}
                fullWidth
                placeholder="Search products or scan barcode (Ctrl+F)"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                InputProps={{
                  endAdornment: (
                    <IconButton onClick={() => setIsScannerOpen(true)}>
                      <QrCodeScanner />
                    </IconButton>
                  ),
                }}
              />
            </Box>

            {/* Product Grid */}
            <Box sx={{ flex: 1, overflow: 'auto' }}>
              {isLoadingProducts ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
                  <CircularProgress />
                </Box>
              ) : (
                <Grid container spacing={2}>
                  {productsData?.data.products.map((product) => (
                    <Grid item xs={12} sm={6} md={4} lg={3} key={product.id}>
                      <Card
                        sx={{
                          cursor: 'pointer',
                          '&:hover': { elevation: 4 },
                          opacity: product.currentStock <= 0 ? 0.5 : 1,
                        }}
                        onClick={() => {
                          if (product.currentStock > 0) {
                            addProductToCart(product);
                          } else {
                            toast.error('Product is out of stock');
                          }
                        }}
                      >
                        <CardContent sx={{ p: 2 }}>
                          {product.image && (
                            <Box
                              component="img"
                              src={product.image}
                              alt={product.name}
                              sx={{
                                width: '100%',
                                height: 120,
                                objectFit: 'cover',
                                borderRadius: 1,
                                mb: 1,
                              }}
                            />
                          )}
                          <Typography variant="subtitle2" noWrap>
                            {product.name}
                          </Typography>
                          <Typography variant="body2" color="textSecondary" noWrap>
                            {product.sku}
                          </Typography>
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 1 }}>
                            <Typography variant="h6" color="primary">
                              ${product.price.toFixed(2)}
                            </Typography>
                            <Box sx={{ display: 'flex', alignItems: 'center' }}>
                              {product.currentStock <= product.minStock && (
                                <Warning color="warning" fontSize="small" sx={{ mr: 0.5 }} />
                              )}
                              <Typography
                                variant="caption"
                                color={product.currentStock <= 0 ? 'error' : 'textSecondary'}
                              >
                                Stock: {product.currentStock}
                              </Typography>
                            </Box>
                          </Box>
                        </CardContent>
                      </Card>
                    </Grid>
                  ))}
                </Grid>
              )}
            </Box>
          </Paper>
        </Grid>

        {/* Right Panel - Cart */}
        <Grid item xs={12} md={4} sx={{ height: '100%' }}>
          <Paper sx={{ p: 2, height: '100%', display: 'flex', flexDirection: 'column' }}>
            {/* Customer Selection */}
            <Box sx={{ mb: 2 }}>
              <CustomerSelector
                selectedCustomer={selectedCustomer}
                onCustomerSelect={setSelectedCustomer}
              />
            </Box>

            <Divider sx={{ mb: 2 }} />

            {/* Cart Items */}
            <Typography variant="h6" gutterBottom>
              Cart ({cart.length} items)
            </Typography>

            <Box sx={{ flex: 1, overflow: 'auto', mb: 2 }}>
              {cart.length === 0 ? (
                <Box sx={{ textAlign: 'center', py: 4 }}>
                  <ShoppingCart sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
                  <Typography color="textSecondary">
                    Cart is empty
                  </Typography>
                  <Typography variant="body2" color="textSecondary">
                    Scan or click products to add them
                  </Typography>
                </Box>
              ) : (
                <List dense>
                  {cart.map((item, index) => (
                    <ListItem key={index} divider>
                      <ListItemText
                        primary={item.product.name}
                        secondary={
                          <Box>
                            <Typography variant="body2">
                              ${item.product.price.toFixed(2)} × {item.quantity}
                            </Typography>
                            {item.discount > 0 && (
                              <Typography variant="caption" color="success.main">
                                Discount: -${item.discount.toFixed(2)}
                              </Typography>
                            )}
                          </Box>
                        }
                      />
                      <Box sx={{ textAlign: 'right' }}>
                        <Typography variant="subtitle2">
                          ${item.subtotal.toFixed(2)}
                        </Typography>
                        <IconButton
                          size="small"
                          onClick={() => removeFromCart(item.product.id)}
                          color="error"
                        >
                          <Delete fontSize="small" />
                        </IconButton>
                      </Box>
                    </ListItem>
                  ))}
                </List>
              )}
            </Box>

            {/* Totals */}
            {cart.length > 0 && (
              <Box sx={{ borderTop: 1, borderColor: 'divider', pt: 2 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                  <Typography>Subtotal:</Typography>
                  <Typography>${totals.subtotal.toFixed(2)}</Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                  <Typography>Tax:</Typography>
                  <Typography>${totals.tax.toFixed(2)}</Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                  <Typography variant="h6">Total:</Typography>
                  <Typography variant="h6" color="primary">
                    ${totals.total.toFixed(2)}
                  </Typography>
                </Box>

                {/* Action Buttons */}
                <Grid container spacing={2}>
                  <Grid item xs={6}>
                    <Button
                      fullWidth
                      variant="outlined"
                      startIcon={<Clear />}
                      onClick={clearCart}
                    >
                      Clear
                    </Button>
                  </Grid>
                  <Grid item xs={6}>
                    <Button
                      fullWidth
                      variant="contained"
                      startIcon={<Payment />}
                      onClick={() => setIsPaymentOpen(true)}
                      disabled={completeSaleMutation.isLoading}
                    >
                      Pay
                    </Button>
                  </Grid>
                </Grid>
              </Box>
            )}
          </Paper>
        </Grid>
      </Grid>

      {/* Dialogs */}
      <BarcodeScanner
        open={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onScan={handleBarcodeScanned}
      />

      <PaymentDialog
        open={isPaymentOpen}
        onClose={() => setIsPaymentOpen(false)}
        onPayment={handlePayment}
        total={totals.total}
        isLoading={completeSaleMutation.isLoading}
      />

      <ReceiptPrint
        open={isReceiptOpen}
        onClose={() => setIsReceiptOpen(false)}
        sale={completedSale}
      />
    </Box>
  );
};

export default POSInterface;