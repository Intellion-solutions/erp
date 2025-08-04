import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  TextField,
  Typography,
  Grid,
  Card,
  CardContent,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  RadioGroup,
  FormControlLabel,
  Radio,
  Chip,
  Alert,
  Divider,
  Avatar,
  IconButton,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Stepper,
  Step,
  StepLabel
} from '@mui/material';
import {
  Close,
  Add,
  Remove,
  TrendingUp,
  TrendingDown,
  Inventory,
  Warning,
  CheckCircle,
  Assignment,
  LocationOn,
  Person,
  CalendarToday,
  AttachFile,
  Camera
} from '@mui/icons-material';
import { useMutation, useQueryClient } from 'react-query';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

import { productsApi } from '../../services/api';
import { Product } from '../../types';

interface StockAdjustmentDialogProps {
  open: boolean;
  onClose: () => void;
  product: Product | null;
  onSuccess: () => void;
}

interface AdjustmentReason {
  id: string;
  label: string;
  description: string;
  requiresApproval: boolean;
  category: 'positive' | 'negative' | 'correction';
}

const adjustmentReasons: AdjustmentReason[] = [
  // Positive adjustments
  {
    id: 'stock_receipt',
    label: 'Stock Receipt',
    description: 'New inventory received from supplier',
    requiresApproval: false,
    category: 'positive'
  },
  {
    id: 'return_from_customer',
    label: 'Customer Return',
    description: 'Product returned by customer',
    requiresApproval: false,
    category: 'positive'
  },
  {
    id: 'found_inventory',
    label: 'Found Inventory',
    description: 'Previously missing stock found',
    requiresApproval: true,
    category: 'positive'
  },
  
  // Negative adjustments
  {
    id: 'damaged_goods',
    label: 'Damaged Goods',
    description: 'Products damaged and unsellable',
    requiresApproval: false,
    category: 'negative'
  },
  {
    id: 'expired_products',
    label: 'Expired Products',
    description: 'Products past expiration date',
    requiresApproval: false,
    category: 'negative'
  },
  {
    id: 'theft_shrinkage',
    label: 'Theft/Shrinkage',
    description: 'Products lost due to theft or shrinkage',
    requiresApproval: true,
    category: 'negative'
  },
  {
    id: 'return_to_supplier',
    label: 'Return to Supplier',
    description: 'Products returned to supplier',
    requiresApproval: false,
    category: 'negative'
  },
  
  // Corrections
  {
    id: 'count_correction',
    label: 'Physical Count Correction',
    description: 'Correction based on physical inventory count',
    requiresApproval: false,
    category: 'correction'
  },
  {
    id: 'system_error',
    label: 'System Error Correction',
    description: 'Correction due to system error',
    requiresApproval: true,
    category: 'correction'
  }
];

const steps = ['Select Type', 'Enter Details', 'Review & Confirm'];

const StockAdjustmentDialog: React.FC<StockAdjustmentDialogProps> = ({
  open,
  onClose,
  product,
  onSuccess
}) => {
  const [activeStep, setActiveStep] = useState(0);
  const [adjustmentType, setAdjustmentType] = useState<'increase' | 'decrease' | 'set'>('increase');
  const [quantity, setQuantity] = useState<string>('');
  const [selectedReason, setSelectedReason] = useState<string>('');
  const [customReason, setCustomReason] = useState('');
  const [notes, setNotes] = useState('');
  const [location, setLocation] = useState('');
  const [batchNumber, setBatchNumber] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [documentReference, setDocumentReference] = useState('');
  const [errors, setErrors] = useState<{[key: string]: string}>({});

  const queryClient = useQueryClient();

  // Reset form when dialog opens/closes
  useEffect(() => {
    if (open && product) {
      setActiveStep(0);
      setAdjustmentType('increase');
      setQuantity('');
      setSelectedReason('');
      setCustomReason('');
      setNotes('');
      setLocation('');
      setBatchNumber('');
      setExpiryDate('');
      setDocumentReference('');
      setErrors({});
    }
  }, [open, product]);

  // Mutation for stock adjustment
  const adjustStockMutation = useMutation(
    (adjustmentData: any) => productsApi.adjustStock(product!.id, adjustmentData),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['products']);
        toast.success('Stock adjustment completed successfully');
        onSuccess();
      },
      onError: (error: any) => {
        toast.error(error.response?.data?.error || 'Failed to adjust stock');
      }
    }
  );

  // Calculate new stock level
  const calculateNewStock = () => {
    if (!product || !quantity) return product?.currentStock || 0;
    
    const adjustmentQty = parseInt(quantity);
    const currentStock = product.currentStock;
    
    switch (adjustmentType) {
      case 'increase':
        return currentStock + adjustmentQty;
      case 'decrease':
        return Math.max(0, currentStock - adjustmentQty);
      case 'set':
        return adjustmentQty;
      default:
        return currentStock;
    }
  };

  // Validate form
  const validateForm = () => {
    const newErrors: {[key: string]: string} = {};

    if (!quantity || parseInt(quantity) <= 0) {
      newErrors.quantity = 'Quantity is required and must be greater than 0';
    }

    if (!selectedReason && !customReason) {
      newErrors.reason = 'Please select or enter a reason for adjustment';
    }

    if (adjustmentType === 'decrease' && parseInt(quantity) > (product?.currentStock || 0)) {
      newErrors.quantity = 'Cannot decrease stock below 0';
    }

    const reason = adjustmentReasons.find(r => r.id === selectedReason);
    if (reason?.requiresApproval && !notes.trim()) {
      newErrors.notes = 'Notes are required for this type of adjustment';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Handle next step
  const handleNext = () => {
    if (activeStep === 1 && !validateForm()) {
      return;
    }
    setActiveStep(prev => prev + 1);
  };

  // Handle previous step
  const handleBack = () => {
    setActiveStep(prev => prev - 1);
  };

  // Handle form submission
  const handleSubmit = () => {
    if (!validateForm()) return;

    const adjustmentData = {
      type: adjustmentType,
      quantity: parseInt(quantity),
      reason: selectedReason || 'custom',
      customReason: customReason || undefined,
      notes: notes || undefined,
      location: location || undefined,
      batchNumber: batchNumber || undefined,
      expiryDate: expiryDate || undefined,
      documentReference: documentReference || undefined
    };

    adjustStockMutation.mutate(adjustmentData);
  };

  const newStockLevel = calculateNewStock();
  const stockDifference = newStockLevel - (product?.currentStock || 0);
  const selectedReasonData = adjustmentReasons.find(r => r.id === selectedReason);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: { borderRadius: 2, minHeight: 600 }
      }}
    >
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Inventory color="primary" />
            <Typography variant="h6">Stock Adjustment</Typography>
          </Box>
          <IconButton onClick={onClose} size="small">
            <Close />
          </IconButton>
        </Box>
      </DialogTitle>

      <DialogContent>
        {/* Product Info */}
        {product && (
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Avatar
                  src={product.image || ''}
                  sx={{ width: 60, height: 60 }}
                  variant="rounded"
                >
                  <Inventory />
                </Avatar>
                <Box sx={{ flex: 1 }}>
                  <Typography variant="h6">{product.name}</Typography>
                  <Typography color="textSecondary">SKU: {product.sku}</Typography>
                  <Typography color="textSecondary">
                    Current Stock: <strong>{product.currentStock}</strong> units
                  </Typography>
                </Box>
                <Box sx={{ textAlign: 'right' }}>
                  <Typography variant="body2" color="textSecondary">
                    Min Stock Level
                  </Typography>
                  <Typography variant="h6" color={product.currentStock <= product.minStock ? 'error' : 'inherit'}>
                    {product.minStock}
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        )}

        {/* Stepper */}
        <Stepper activeStep={activeStep} sx={{ mb: 4 }}>
          {steps.map((label) => (
            <Step key={label}>
              <StepLabel>{label}</StepLabel>
            </Step>
          ))}
        </Stepper>

        {/* Step Content */}
        {activeStep === 0 && (
          <Box>
            <Typography variant="h6" gutterBottom>
              Select Adjustment Type
            </Typography>
            <RadioGroup
              value={adjustmentType}
              onChange={(e) => setAdjustmentType(e.target.value as any)}
            >
              <FormControlLabel
                value="increase"
                control={<Radio />}
                label={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <TrendingUp color="success" />
                    <Box>
                      <Typography>Increase Stock</Typography>
                      <Typography variant="body2" color="textSecondary">
                        Add quantity to current stock
                      </Typography>
                    </Box>
                  </Box>
                }
              />
              <FormControlLabel
                value="decrease"
                control={<Radio />}
                label={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <TrendingDown color="error" />
                    <Box>
                      <Typography>Decrease Stock</Typography>
                      <Typography variant="body2" color="textSecondary">
                        Remove quantity from current stock
                      </Typography>
                    </Box>
                  </Box>
                }
              />
              <FormControlLabel
                value="set"
                control={<Radio />}
                label={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Assignment color="primary" />
                    <Box>
                      <Typography>Set Absolute Value</Typography>
                      <Typography variant="body2" color="textSecondary">
                        Set stock to specific quantity
                      </Typography>
                    </Box>
                  </Box>
                }
              />
            </RadioGroup>
          </Box>
        )}

        {activeStep === 1 && (
          <Box>
            <Typography variant="h6" gutterBottom>
              Enter Adjustment Details
            </Typography>
            
            <Grid container spacing={3}>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label={
                    adjustmentType === 'set' ? 'Set Stock To' :
                    adjustmentType === 'increase' ? 'Quantity to Add' :
                    'Quantity to Remove'
                  }
                  type="number"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  error={!!errors.quantity}
                  helperText={errors.quantity}
                  InputProps={{
                    inputProps: { min: 1 }
                  }}
                />
              </Grid>

              <Grid item xs={12} md={6}>
                <FormControl fullWidth error={!!errors.reason}>
                  <InputLabel>Reason</InputLabel>
                  <Select
                    value={selectedReason}
                    onChange={(e) => setSelectedReason(e.target.value)}
                    label="Reason"
                  >
                    {adjustmentReasons
                      .filter(reason => {
                        if (adjustmentType === 'increase') {
                          return reason.category === 'positive' || reason.category === 'correction';
                        }
                        if (adjustmentType === 'decrease') {
                          return reason.category === 'negative' || reason.category === 'correction';
                        }
                        return true;
                      })
                      .map((reason) => (
                        <MenuItem key={reason.id} value={reason.id}>
                          <Box>
                            <Typography>{reason.label}</Typography>
                            <Typography variant="caption" color="textSecondary">
                              {reason.description}
                            </Typography>
                          </Box>
                        </MenuItem>
                      ))}
                    <MenuItem value="">
                      <Typography>Other (Custom Reason)</Typography>
                    </MenuItem>
                  </Select>
                </FormControl>
              </Grid>

              {!selectedReason && (
                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    label="Custom Reason"
                    value={customReason}
                    onChange={(e) => setCustomReason(e.target.value)}
                    placeholder="Enter custom reason for adjustment..."
                  />
                </Grid>
              )}

              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Notes"
                  multiline
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  error={!!errors.notes}
                  helperText={errors.notes || 'Additional details about the adjustment'}
                  placeholder="Enter any additional notes..."
                />
              </Grid>

              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="Location/Bin"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Storage location or bin number"
                />
              </Grid>

              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="Document Reference"
                  value={documentReference}
                  onChange={(e) => setDocumentReference(e.target.value)}
                  placeholder="Receipt number, order ID, etc."
                />
              </Grid>

              {(adjustmentType === 'increase' && selectedReason === 'stock_receipt') && (
                <>
                  <Grid item xs={12} md={6}>
                    <TextField
                      fullWidth
                      label="Batch/Lot Number"
                      value={batchNumber}
                      onChange={(e) => setBatchNumber(e.target.value)}
                      placeholder="Batch or lot number"
                    />
                  </Grid>

                  <Grid item xs={12} md={6}>
                    <TextField
                      fullWidth
                      label="Expiry Date"
                      type="date"
                      value={expiryDate}
                      onChange={(e) => setExpiryDate(e.target.value)}
                      InputLabelProps={{ shrink: true }}
                    />
                  </Grid>
                </>
              )}
            </Grid>

            {selectedReasonData?.requiresApproval && (
              <Alert severity="warning" sx={{ mt: 2 }}>
                <Typography variant="subtitle2" fontWeight="bold">
                  Approval Required
                </Typography>
                <Typography variant="body2">
                  This type of adjustment requires manager approval. Please provide detailed notes.
                </Typography>
              </Alert>
            )}
          </Box>
        )}

        {activeStep === 2 && (
          <Box>
            <Typography variant="h6" gutterBottom>
              Review & Confirm Adjustment
            </Typography>

            <Grid container spacing={3}>
              <Grid item xs={12} md={6}>
                <Card variant="outlined">
                  <CardContent>
                    <Typography variant="subtitle1" gutterBottom>
                      Current Status
                    </Typography>
                    <List dense>
                      <ListItem>
                        <ListItemIcon>
                          <Inventory />
                        </ListItemIcon>
                        <ListItemText
                          primary="Current Stock"
                          secondary={`${product?.currentStock} units`}
                        />
                      </ListItem>
                      <ListItem>
                        <ListItemIcon>
                          <CalendarToday />
                        </ListItemIcon>
                        <ListItemText
                          primary="Adjustment Date"
                          secondary={format(new Date(), 'PPP')}
                        />
                      </ListItem>
                    </List>
                  </CardContent>
                </Card>
              </Grid>

              <Grid item xs={12} md={6}>
                <Card variant="outlined">
                  <CardContent>
                    <Typography variant="subtitle1" gutterBottom>
                      Adjustment Details
                    </Typography>
                    <List dense>
                      <ListItem>
                        <ListItemIcon>
                          {adjustmentType === 'increase' ? (
                            <TrendingUp color="success" />
                          ) : adjustmentType === 'decrease' ? (
                            <TrendingDown color="error" />
                          ) : (
                            <Assignment color="primary" />
                          )}
                        </ListItemIcon>
                        <ListItemText
                          primary="Adjustment Type"
                          secondary={
                            adjustmentType === 'increase' ? 'Increase Stock' :
                            adjustmentType === 'decrease' ? 'Decrease Stock' :
                            'Set Absolute Value'
                          }
                        />
                      </ListItem>
                      <ListItem>
                        <ListItemIcon>
                          <Assignment />
                        </ListItemIcon>
                        <ListItemText
                          primary="Quantity"
                          secondary={`${quantity} units`}
                        />
                      </ListItem>
                      <ListItem>
                        <ListItemIcon>
                          <Person />
                        </ListItemIcon>
                        <ListItemText
                          primary="Reason"
                          secondary={
                            selectedReasonData?.label || customReason || 'Custom reason'
                          }
                        />
                      </ListItem>
                    </List>
                  </CardContent>
                </Card>
              </Grid>

              <Grid item xs={12}>
                <Card sx={{ bgcolor: 'primary.light' }}>
                  <CardContent>
                    <Typography variant="h6" color="primary.contrastText" gutterBottom>
                      Stock Level Summary
                    </Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Box sx={{ textAlign: 'center' }}>
                        <Typography variant="h4" color="primary.contrastText">
                          {product?.currentStock}
                        </Typography>
                        <Typography color="primary.contrastText">Current</Typography>
                      </Box>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        {stockDifference > 0 ? (
                          <Add color="inherit" />
                        ) : stockDifference < 0 ? (
                          <Remove color="inherit" />
                        ) : (
                          <Assignment color="inherit" />
                        )}
                        <Typography variant="h5" color="primary.contrastText">
                          {Math.abs(stockDifference)}
                        </Typography>
                      </Box>
                      <Box sx={{ textAlign: 'center' }}>
                        <Typography variant="h4" color="primary.contrastText">
                          {newStockLevel}
                        </Typography>
                        <Typography color="primary.contrastText">New Stock</Typography>
                      </Box>
                    </Box>
                  </CardContent>
                </Card>
              </Grid>

              {newStockLevel <= (product?.minStock || 0) && (
                <Grid item xs={12}>
                  <Alert severity="warning">
                    <Typography variant="subtitle2" fontWeight="bold">
                      Low Stock Warning
                    </Typography>
                    <Typography variant="body2">
                      The new stock level ({newStockLevel}) is at or below the minimum stock level ({product?.minStock}).
                      Consider reordering this product.
                    </Typography>
                  </Alert>
                </Grid>
              )}
            </Grid>
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ p: 3 }}>
        <Button onClick={onClose} disabled={adjustStockMutation.isLoading}>
          Cancel
        </Button>
        {activeStep > 0 && (
          <Button onClick={handleBack} disabled={adjustStockMutation.isLoading}>
            Back
          </Button>
        )}
        {activeStep < steps.length - 1 ? (
          <Button variant="contained" onClick={handleNext}>
            Next
          </Button>
        ) : (
          <Button
            variant="contained"
            onClick={handleSubmit}
            disabled={adjustStockMutation.isLoading}
            startIcon={adjustStockMutation.isLoading ? undefined : <CheckCircle />}
          >
            {adjustStockMutation.isLoading ? 'Processing...' : 'Confirm Adjustment'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
};

export default StockAdjustmentDialog;