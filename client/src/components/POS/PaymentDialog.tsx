import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  TextField,
  Grid,
  Card,
  CardContent,
  Divider,
  Chip,
  IconButton,
  Alert,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Switch,
  FormControlLabel,
  List,
  ListItem,
  ListItemText,
  ListItemIcon
} from '@mui/material';
import {
  Payment,
  CreditCard,
  AccountBalance,
  Phone,
  Receipt,
  Close,
  Check,
  AttachMoney,
  Calculate,
  Print,
  Save
} from '@mui/icons-material';
import { PaymentMethod } from '../../types';

interface PaymentDialogProps {
  open: boolean;
  onClose: () => void;
  onPayment: (paymentData: any) => void;
  total: number;
  isLoading?: boolean;
}

interface PaymentMethodOption {
  id: PaymentMethod;
  label: string;
  icon: React.ReactNode;
  color: string;
  description: string;
}

const paymentMethods: PaymentMethodOption[] = [
  {
    id: 'CASH' as PaymentMethod,
    label: 'Cash',
    icon: <AttachMoney />,
    color: '#4caf50',
    description: 'Physical cash payment'
  },
  {
    id: 'CARD' as PaymentMethod,
    label: 'Card',
    icon: <CreditCard />,
    color: '#2196f3',
    description: 'Credit/Debit card'
  },
  {
    id: 'BANK_TRANSFER' as PaymentMethod,
    label: 'Bank Transfer',
    icon: <AccountBalance />,
    color: '#ff9800',
    description: 'Direct bank transfer'
  },
  {
    id: 'MOBILE_MONEY' as PaymentMethod,
    label: 'Mobile Money',
    icon: <Phone />,
    color: '#9c27b0',
    description: 'Mobile wallet payment'
  },
  {
    id: 'CHEQUE' as PaymentMethod,
    label: 'Cheque',
    icon: <Receipt />,
    color: '#795548',
    description: 'Bank cheque'
  },
  {
    id: 'CREDIT' as PaymentMethod,
    label: 'Credit',
    icon: <Payment />,
    color: '#f44336',
    description: 'Customer credit account'
  }
];

const PaymentDialog: React.FC<PaymentDialogProps> = ({
  open,
  onClose,
  onPayment,
  total,
  isLoading = false
}) => {
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod>('CASH');
  const [amountPaid, setAmountPaid] = useState<string>(total.toString());
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [splitPayment, setSplitPayment] = useState(false);
  const [splitAmounts, setSplitAmounts] = useState<{[key: string]: number}>({});
  const [errors, setErrors] = useState<{[key: string]: string}>({});
  const [exactAmount, setExactAmount] = useState(false);

  // Quick amount buttons for cash
  const quickAmounts = [5, 10, 20, 50, 100, 200];

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setAmountPaid(total.toString());
      setReference('');
      setNotes('');
      setErrors({});
      setSplitPayment(false);
      setSplitAmounts({});
      setExactAmount(false);
    }
  }, [open, total]);

  // Calculate change
  const change = parseFloat(amountPaid) - total;

  // Validate payment
  const validatePayment = () => {
    const newErrors: {[key: string]: string} = {};

    if (!amountPaid || parseFloat(amountPaid) <= 0) {
      newErrors.amount = 'Payment amount is required';
    }

    if (parseFloat(amountPaid) < total) {
      newErrors.amount = 'Insufficient payment amount';
    }

    if (selectedMethod === 'BANK_TRANSFER' && !reference.trim()) {
      newErrors.reference = 'Transfer reference is required';
    }

    if (selectedMethod === 'CHEQUE' && !reference.trim()) {
      newErrors.reference = 'Cheque number is required';
    }

    if (selectedMethod === 'CARD' && !reference.trim()) {
      newErrors.reference = 'Card reference/authorization is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Handle payment submission
  const handlePayment = () => {
    if (!validatePayment()) return;

    const paymentData = {
      paymentMethod: selectedMethod,
      amountPaid: parseFloat(amountPaid),
      paymentReference: reference || undefined,
      notes: notes || undefined,
      splitPayment: splitPayment ? splitAmounts : undefined
    };

    onPayment(paymentData);
  };

  // Handle quick amount selection
  const handleQuickAmount = (amount: number) => {
    setAmountPaid(amount.toString());
    setExactAmount(false);
  };

  // Handle exact amount
  const handleExactAmount = () => {
    setAmountPaid(total.toString());
    setExactAmount(true);
  };

  // Handle payment method change
  const handleMethodChange = (method: PaymentMethod) => {
    setSelectedMethod(method);
    setReference('');
    setErrors({});
  };

  // Get method details
  const selectedMethodDetails = paymentMethods.find(m => m.id === selectedMethod);

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
            <Payment color="primary" />
            <Typography variant="h6">Process Payment</Typography>
          </Box>
          <IconButton onClick={onClose} size="small" disabled={isLoading}>
            <Close />
          </IconButton>
        </Box>
      </DialogTitle>

      <DialogContent>
        <Grid container spacing={3}>
          {/* Payment Summary */}
          <Grid item xs={12}>
            <Card variant="outlined">
              <CardContent>
                <Typography variant="h6" gutterBottom>Payment Summary</Typography>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                  <Typography>Total Amount:</Typography>
                  <Typography variant="h6" color="primary">
                    ${total.toFixed(2)}
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                  <Typography>Amount Paid:</Typography>
                  <Typography variant="h6">
                    ${parseFloat(amountPaid || '0').toFixed(2)}
                  </Typography>
                </Box>
                <Divider sx={{ my: 1 }} />
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="h6">Change:</Typography>
                  <Typography 
                    variant="h6" 
                    color={change >= 0 ? 'success.main' : 'error.main'}
                  >
                    ${Math.max(0, change).toFixed(2)}
                  </Typography>
                </Box>
              </CardContent>
            </Card>
          </Grid>

          {/* Payment Methods */}
          <Grid item xs={12}>
            <Typography variant="h6" gutterBottom>
              Select Payment Method
            </Typography>
            <Grid container spacing={2}>
              {paymentMethods.map((method) => (
                <Grid item xs={6} sm={4} key={method.id}>
                  <Card
                    sx={{
                      cursor: 'pointer',
                      border: selectedMethod === method.id ? 2 : 1,
                      borderColor: selectedMethod === method.id ? method.color : 'divider',
                      '&:hover': {
                        borderColor: method.color,
                        elevation: 2
                      }
                    }}
                    onClick={() => handleMethodChange(method.id)}
                  >
                    <CardContent sx={{ textAlign: 'center', p: 2 }}>
                      <Box sx={{ color: method.color, mb: 1 }}>
                        {method.icon}
                      </Box>
                      <Typography variant="subtitle2" fontWeight="bold">
                        {method.label}
                      </Typography>
                      <Typography variant="caption" color="textSecondary">
                        {method.description}
                      </Typography>
                      {selectedMethod === method.id && (
                        <Check sx={{ color: method.color, mt: 1 }} />
                      )}
                    </CardContent>
                  </Card>
                </Grid>
              ))}
            </Grid>
          </Grid>

          {/* Amount Input */}
          <Grid item xs={12} md={6}>
            <Typography variant="h6" gutterBottom>
              Payment Amount
            </Typography>
            
            <TextField
              fullWidth
              label="Amount Paid"
              type="number"
              value={amountPaid}
              onChange={(e) => {
                setAmountPaid(e.target.value);
                setExactAmount(false);
              }}
              error={!!errors.amount}
              helperText={errors.amount}
              InputProps={{
                startAdornment: <Typography sx={{ mr: 1 }}>$</Typography>
              }}
              sx={{ mb: 2 }}
            />

            {/* Quick Amount Buttons (for cash) */}
            {selectedMethod === 'CASH' && (
              <Box>
                <Typography variant="subtitle2" gutterBottom>
                  Quick Amounts
                </Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 2 }}>
                  <Button
                    size="small"
                    variant={exactAmount ? 'contained' : 'outlined'}
                    onClick={handleExactAmount}
                    startIcon={<Check />}
                  >
                    Exact
                  </Button>
                  {quickAmounts.map((amount) => (
                    <Button
                      key={amount}
                      size="small"
                      variant="outlined"
                      onClick={() => handleQuickAmount(amount)}
                    >
                      ${amount}
                    </Button>
                  ))}
                </Box>
              </Box>
            )}

            {/* Change Display */}
            {selectedMethod === 'CASH' && change > 0 && (
              <Alert severity="info" sx={{ mb: 2 }}>
                <Typography variant="subtitle2">
                  Change to return: <strong>${change.toFixed(2)}</strong>
                </Typography>
              </Alert>
            )}
          </Grid>

          {/* Payment Details */}
          <Grid item xs={12} md={6}>
            <Typography variant="h6" gutterBottom>
              Payment Details
            </Typography>

            {/* Reference/Transaction ID */}
            {['BANK_TRANSFER', 'CHEQUE', 'CARD', 'MOBILE_MONEY'].includes(selectedMethod) && (
              <TextField
                fullWidth
                label={
                  selectedMethod === 'BANK_TRANSFER' ? 'Transfer Reference' :
                  selectedMethod === 'CHEQUE' ? 'Cheque Number' :
                  selectedMethod === 'CARD' ? 'Authorization Code' :
                  'Transaction ID'
                }
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                error={!!errors.reference}
                helperText={errors.reference}
                sx={{ mb: 2 }}
              />
            )}

            {/* Notes */}
            <TextField
              fullWidth
              label="Notes (Optional)"
              multiline
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add any additional notes..."
            />
          </Grid>

          {/* Payment Instructions */}
          <Grid item xs={12}>
            {selectedMethodDetails && (
              <Card variant="outlined" sx={{ bgcolor: 'background.default' }}>
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                    <Box sx={{ color: selectedMethodDetails.color }}>
                      {selectedMethodDetails.icon}
                    </Box>
                    <Typography variant="subtitle1" fontWeight="bold">
                      {selectedMethodDetails.label} Payment Instructions
                    </Typography>
                  </Box>
                  
                  {selectedMethod === 'CASH' && (
                    <Typography variant="body2">
                      • Count the cash received carefully<br/>
                      • Verify all bills are genuine<br/>
                      • Calculate and return exact change<br/>
                      • Store cash securely in register
                    </Typography>
                  )}
                  
                  {selectedMethod === 'CARD' && (
                    <Typography variant="body2">
                      • Insert or tap card on terminal<br/>
                      • Enter amount and confirm<br/>
                      • Wait for authorization<br/>
                      • Provide receipt to customer
                    </Typography>
                  )}
                  
                  {selectedMethod === 'BANK_TRANSFER' && (
                    <Typography variant="body2">
                      • Verify transfer reference number<br/>
                      • Check bank account for received amount<br/>
                      • Confirm transfer details match<br/>
                      • Save reference for records
                    </Typography>
                  )}
                  
                  {selectedMethod === 'MOBILE_MONEY' && (
                    <Typography variant="body2">
                      • Provide mobile money number<br/>
                      • Wait for customer to send payment<br/>
                      • Verify transaction SMS/notification<br/>
                      • Record transaction ID
                    </Typography>
                  )}
                </CardContent>
              </Card>
            )}
          </Grid>
        </Grid>
      </DialogContent>

      <DialogActions sx={{ p: 3 }}>
        <Button
          onClick={onClose}
          disabled={isLoading}
          size="large"
        >
          Cancel
        </Button>
        <Button
          onClick={handlePayment}
          variant="contained"
          disabled={isLoading || parseFloat(amountPaid) < total}
          startIcon={isLoading ? undefined : <Payment />}
          size="large"
          sx={{ minWidth: 140 }}
        >
          {isLoading ? 'Processing...' : 'Process Payment'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default PaymentDialog;