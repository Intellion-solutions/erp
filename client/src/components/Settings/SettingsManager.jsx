import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Tabs,
  Tab,
  Typography,
  TextField,
  Button,
  Grid,
  Switch,
  FormControlLabel,
  FormGroup,
  Divider,
  Alert,
  Snackbar,
  CircularProgress,
  Card,
  CardContent,
  CardHeader,
  IconButton,
  Tooltip,
  Chip,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Accordion,
  AccordionSummary,
  AccordionDetails
} from '@mui/material';
import {
  Save as SaveIcon,
  Refresh as RefreshIcon,
  Business,
  Receipt,
  PointOfSale,
  Inventory,
  AccountBalance,
  Settings as SettingsIcon,
  Security,
  Email,
  Backup,
  ExpandMore
} from '@mui/icons-material';
import { useSettings } from '../../hooks/useSettings';
import { useSocket } from '../../hooks/useSocket';

const SettingsManager = () => {
  const { settings, updateSettings, loading, error } = useSettings();
  const { socket } = useSocket();
  const [activeTab, setActiveTab] = useState(0);
  const [localSettings, setLocalSettings] = useState({});
  const [saving, setSaving] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });

  useEffect(() => {
    if (settings) {
      setLocalSettings(settings);
    }
  }, [settings]);

  useEffect(() => {
    if (socket) {
      socket.on('settingUpdated', (data) => {
        setSnackbar({
          open: true,
          message: `Setting "${data.key}" updated`,
          severity: 'info'
        });
        // Refresh settings
        window.location.reload();
      });

      socket.on('settingsReset', () => {
        setSnackbar({
          open: true,
          message: 'Settings reset to defaults',
          severity: 'warning'
        });
        window.location.reload();
      });
    }

    return () => {
      if (socket) {
        socket.off('settingUpdated');
        socket.off('settingsReset');
      }
    };
  }, [socket]);

  const handleTabChange = (event, newValue) => {
    setActiveTab(newValue);
  };

  const handleSettingChange = (key, value) => {
    setLocalSettings(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateSettings(localSettings);
      setSnackbar({
        open: true,
        message: 'Settings saved successfully',
        severity: 'success'
      });
    } catch (error) {
      setSnackbar({
        open: true,
        message: 'Failed to save settings',
        severity: 'error'
      });
    }
    setSaving(false);
  };

  const handleReset = async () => {
    if (window.confirm('Are you sure you want to reset all settings to defaults?')) {
      try {
        await fetch('/api/settings/reset', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        });
        setSnackbar({
          open: true,
          message: 'Settings reset to defaults',
          severity: 'warning'
        });
      } catch (error) {
        setSnackbar({
          open: true,
          message: 'Failed to reset settings',
          severity: 'error'
        });
      }
    }
  };

  const tabs = [
    { label: 'Company', icon: <Business />, key: 'company' },
    { label: 'Invoice', icon: <Receipt />, key: 'invoice' },
    { label: 'POS', icon: <PointOfSale />, key: 'pos' },
    { label: 'Inventory', icon: <Inventory />, key: 'inventory' },
    { label: 'Finance', icon: <AccountBalance />, key: 'finance' },
    { label: 'System', icon: <SettingsIcon />, key: 'system' },
    { label: 'Security', icon: <Security />, key: 'security' },
    { label: 'Email/SMS', icon: <Email />, key: 'email' },
    { label: 'Backup', icon: <Backup />, key: 'backup' }
  ];

  const renderCompanySettings = () => (
    <Grid container spacing={3}>
      <Grid item xs={12} md={6}>
        <TextField
          fullWidth
          label="Company Name"
          value={localSettings['company.name'] || ''}
          onChange={(e) => handleSettingChange('company.name', e.target.value)}
        />
      </Grid>
      <Grid item xs={12} md={6}>
        <TextField
          fullWidth
          label="Company Email"
          type="email"
          value={localSettings['company.email'] || ''}
          onChange={(e) => handleSettingChange('company.email', e.target.value)}
        />
      </Grid>
      <Grid item xs={12}>
        <TextField
          fullWidth
          label="Company Address"
          multiline
          rows={3}
          value={localSettings['company.address'] || ''}
          onChange={(e) => handleSettingChange('company.address', e.target.value)}
        />
      </Grid>
      <Grid item xs={12} md={6}>
        <TextField
          fullWidth
          label="Phone Number"
          value={localSettings['company.phone'] || ''}
          onChange={(e) => handleSettingChange('company.phone', e.target.value)}
        />
      </Grid>
      <Grid item xs={12} md={6}>
        <TextField
          fullWidth
          label="Website"
          value={localSettings['company.website'] || ''}
          onChange={(e) => handleSettingChange('company.website', e.target.value)}
        />
      </Grid>
      <Grid item xs={12} md={6}>
        <TextField
          fullWidth
          label="Tax Number"
          value={localSettings['company.tax_number'] || ''}
          onChange={(e) => handleSettingChange('company.tax_number', e.target.value)}
        />
      </Grid>
    </Grid>
  );

  const renderInvoiceSettings = () => (
    <Grid container spacing={3}>
      <Grid item xs={12} md={6}>
        <TextField
          fullWidth
          label="Invoice Number Prefix"
          value={localSettings['invoice.numbering.prefix'] || ''}
          onChange={(e) => handleSettingChange('invoice.numbering.prefix', e.target.value)}
        />
      </Grid>
      <Grid item xs={12} md={6}>
        <TextField
          fullWidth
          label="Invoice Number Suffix"
          value={localSettings['invoice.numbering.suffix'] || ''}
          onChange={(e) => handleSettingChange('invoice.numbering.suffix', e.target.value)}
        />
      </Grid>
      <Grid item xs={12} md={6}>
        <TextField
          fullWidth
          label="Starting Invoice Number"
          type="number"
          value={localSettings['invoice.numbering.start'] || ''}
          onChange={(e) => handleSettingChange('invoice.numbering.start', e.target.value)}
        />
      </Grid>
      <Grid item xs={12} md={6}>
        <TextField
          fullWidth
          label="Number Padding"
          type="number"
          value={localSettings['invoice.numbering.padding'] || ''}
          onChange={(e) => handleSettingChange('invoice.numbering.padding', e.target.value)}
        />
      </Grid>
      <Grid item xs={12} md={6}>
        <FormControl fullWidth>
          <InputLabel>Currency</InputLabel>
          <Select
            value={localSettings['invoice.currency'] || 'USD'}
            onChange={(e) => handleSettingChange('invoice.currency', e.target.value)}
          >
            <MenuItem value="USD">USD</MenuItem>
            <MenuItem value="EUR">EUR</MenuItem>
            <MenuItem value="GBP">GBP</MenuItem>
            <MenuItem value="JPY">JPY</MenuItem>
          </Select>
        </FormControl>
      </Grid>
      <Grid item xs={12} md={6}>
        <TextField
          fullWidth
          label="Tax Rate (%)"
          type="number"
          value={localSettings['invoice.tax_rate'] || ''}
          onChange={(e) => handleSettingChange('invoice.tax_rate', e.target.value)}
        />
      </Grid>
      <Grid item xs={12}>
        <TextField
          fullWidth
          label="Payment Terms"
          value={localSettings['invoice.terms'] || ''}
          onChange={(e) => handleSettingChange('invoice.terms', e.target.value)}
        />
      </Grid>
    </Grid>
  );

  const renderPOSSettings = () => (
    <Grid container spacing={3}>
      <Grid item xs={12}>
        <TextField
          fullWidth
          label="Receipt Header"
          multiline
          rows={2}
          value={localSettings['pos.receipt.header'] || ''}
          onChange={(e) => handleSettingChange('pos.receipt.header', e.target.value)}
        />
      </Grid>
      <Grid item xs={12}>
        <TextField
          fullWidth
          label="Receipt Footer"
          multiline
          rows={2}
          value={localSettings['pos.receipt.footer'] || ''}
          onChange={(e) => handleSettingChange('pos.receipt.footer', e.target.value)}
        />
      </Grid>
      <Grid item xs={12}>
        <FormGroup>
          <FormControlLabel
            control={
              <Switch
                checked={localSettings['pos.cash_drawer.enabled'] === 'true'}
                onChange={(e) => handleSettingChange('pos.cash_drawer.enabled', e.target.checked.toString())}
              />
            }
            label="Enable Cash Drawer"
          />
          <FormControlLabel
            control={
              <Switch
                checked={localSettings['pos.barcode_scanner.enabled'] === 'true'}
                onChange={(e) => handleSettingChange('pos.barcode_scanner.enabled', e.target.checked.toString())}
              />
            }
            label="Enable Barcode Scanner"
          />
          <FormControlLabel
            control={
              <Switch
                checked={localSettings['pos.auto_print'] === 'true'}
                onChange={(e) => handleSettingChange('pos.auto_print', e.target.checked.toString())}
              />
            }
            label="Auto Print Receipts"
          />
        </FormGroup>
      </Grid>
    </Grid>
  );

  const renderInventorySettings = () => (
    <Grid container spacing={3}>
      <Grid item xs={12} md={6}>
        <TextField
          fullWidth
          label="Low Stock Threshold"
          type="number"
          value={localSettings['inventory.low_stock_threshold'] || ''}
          onChange={(e) => handleSettingChange('inventory.low_stock_threshold', e.target.value)}
        />
      </Grid>
      <Grid item xs={12} md={6}>
        <TextField
          fullWidth
          label="Reorder Point"
          type="number"
          value={localSettings['inventory.reorder_point'] || ''}
          onChange={(e) => handleSettingChange('inventory.reorder_point', e.target.value)}
        />
      </Grid>
      <Grid item xs={12} md={6}>
        <FormControl fullWidth>
          <InputLabel>Valuation Method</InputLabel>
          <Select
            value={localSettings['inventory.valuation_method'] || 'FIFO'}
            onChange={(e) => handleSettingChange('inventory.valuation_method', e.target.value)}
          >
            <MenuItem value="FIFO">FIFO</MenuItem>
            <MenuItem value="LIFO">LIFO</MenuItem>
            <MenuItem value="AVERAGE">Average</MenuItem>
          </Select>
        </FormControl>
      </Grid>
      <Grid item xs={12}>
        <FormGroup>
          <FormControlLabel
            control={
              <Switch
                checked={localSettings['inventory.auto_adjust'] === 'true'}
                onChange={(e) => handleSettingChange('inventory.auto_adjust', e.target.checked.toString())}
              />
            }
            label="Auto Stock Adjustment"
          />
        </FormGroup>
      </Grid>
    </Grid>
  );

  const renderFinanceSettings = () => (
    <Grid container spacing={3}>
      <Grid item xs={12} md={6}>
        <FormControl fullWidth>
          <InputLabel>Default Currency</InputLabel>
          <Select
            value={localSettings['finance.default_currency'] || 'USD'}
            onChange={(e) => handleSettingChange('finance.default_currency', e.target.value)}
          >
            <MenuItem value="USD">USD</MenuItem>
            <MenuItem value="EUR">EUR</MenuItem>
            <MenuItem value="GBP">GBP</MenuItem>
            <MenuItem value="JPY">JPY</MenuItem>
          </Select>
        </FormControl>
      </Grid>
      <Grid item xs={12} md={6}>
        <TextField
          fullWidth
          label="Approval Threshold"
          type="number"
          value={localSettings['finance.approval_threshold'] || ''}
          onChange={(e) => handleSettingChange('finance.approval_threshold', e.target.value)}
        />
      </Grid>
      <Grid item xs={12}>
        <TextField
          fullWidth
          label="Exchange Rate API"
          value={localSettings['finance.exchange_rate_api'] || ''}
          onChange={(e) => handleSettingChange('finance.exchange_rate_api', e.target.value)}
        />
      </Grid>
      <Grid item xs={12}>
        <FormGroup>
          <FormControlLabel
            control={
              <Switch
                checked={localSettings['finance.auto_reconciliation'] === 'true'}
                onChange={(e) => handleSettingChange('finance.auto_reconciliation', e.target.checked.toString())}
              />
            }
            label="Auto Bank Reconciliation"
          />
        </FormGroup>
      </Grid>
    </Grid>
  );

  const renderSystemSettings = () => (
    <Grid container spacing={3}>
      <Grid item xs={12} md={6}>
        <FormControl fullWidth>
          <InputLabel>Timezone</InputLabel>
          <Select
            value={localSettings['system.timezone'] || 'UTC'}
            onChange={(e) => handleSettingChange('system.timezone', e.target.value)}
          >
            <MenuItem value="UTC">UTC</MenuItem>
            <MenuItem value="America/New_York">Eastern Time</MenuItem>
            <MenuItem value="America/Chicago">Central Time</MenuItem>
            <MenuItem value="America/Denver">Mountain Time</MenuItem>
            <MenuItem value="America/Los_Angeles">Pacific Time</MenuItem>
          </Select>
        </FormControl>
      </Grid>
      <Grid item xs={12} md={6}>
        <TextField
          fullWidth
          label="Date Format"
          value={localSettings['system.date_format'] || ''}
          onChange={(e) => handleSettingChange('system.date_format', e.target.value)}
        />
      </Grid>
      <Grid item xs={12} md={6}>
        <TextField
          fullWidth
          label="Time Format"
          value={localSettings['system.time_format'] || ''}
          onChange={(e) => handleSettingChange('system.time_format', e.target.value)}
        />
      </Grid>
      <Grid item xs={12} md={6}>
        <FormControl fullWidth>
          <InputLabel>Language</InputLabel>
          <Select
            value={localSettings['system.language'] || 'en'}
            onChange={(e) => handleSettingChange('system.language', e.target.value)}
          >
            <MenuItem value="en">English</MenuItem>
            <MenuItem value="es">Spanish</MenuItem>
            <MenuItem value="fr">French</MenuItem>
            <MenuItem value="de">German</MenuItem>
          </Select>
        </FormControl>
      </Grid>
      <Grid item xs={12}>
        <FormGroup>
          <FormControlLabel
            control={
              <Switch
                checked={localSettings['system.notifications.enabled'] === 'true'}
                onChange={(e) => handleSettingChange('system.notifications.enabled', e.target.checked.toString())}
              />
            }
            label="Enable Notifications"
          />
          <FormControlLabel
            control={
              <Switch
                checked={localSettings['system.audit_logging'] === 'true'}
                onChange={(e) => handleSettingChange('system.audit_logging', e.target.checked.toString())}
              />
            }
            label="Enable Audit Logging"
          />
        </FormGroup>
      </Grid>
    </Grid>
  );

  const renderSecuritySettings = () => (
    <Grid container spacing={3}>
      <Grid item xs={12} md={6}>
        <TextField
          fullWidth
          label="Session Timeout (seconds)"
          type="number"
          value={localSettings['security.session_timeout'] || ''}
          onChange={(e) => handleSettingChange('security.session_timeout', e.target.value)}
        />
      </Grid>
      <Grid item xs={12} md={6}>
        <TextField
          fullWidth
          label="Password Min Length"
          type="number"
          value={localSettings['security.password_min_length'] || ''}
          onChange={(e) => handleSettingChange('security.password_min_length', e.target.value)}
        />
      </Grid>
      <Grid item xs={12} md={6}>
        <TextField
          fullWidth
          label="Login Attempts"
          type="number"
          value={localSettings['security.login_attempts'] || ''}
          onChange={(e) => handleSettingChange('security.login_attempts', e.target.value)}
        />
      </Grid>
      <Grid item xs={12}>
        <FormGroup>
          <FormControlLabel
            control={
              <Switch
                checked={localSettings['security.require_2fa'] === 'true'}
                onChange={(e) => handleSettingChange('security.require_2fa', e.target.checked.toString())}
              />
            }
            label="Require Two-Factor Authentication"
          />
        </FormGroup>
      </Grid>
    </Grid>
  );

  const renderEmailSettings = () => (
    <Grid container spacing={3}>
      <Grid item xs={12} md={6}>
        <TextField
          fullWidth
          label="SMTP Host"
          value={localSettings['email.smtp_host'] || ''}
          onChange={(e) => handleSettingChange('email.smtp_host', e.target.value)}
        />
      </Grid>
      <Grid item xs={12} md={6}>
        <TextField
          fullWidth
          label="SMTP Port"
          type="number"
          value={localSettings['email.smtp_port'] || ''}
          onChange={(e) => handleSettingChange('email.smtp_port', e.target.value)}
        />
      </Grid>
      <Grid item xs={12} md={6}>
        <TextField
          fullWidth
          label="SMTP Username"
          value={localSettings['email.smtp_user'] || ''}
          onChange={(e) => handleSettingChange('email.smtp_user', e.target.value)}
        />
      </Grid>
      <Grid item xs={12} md={6}>
        <TextField
          fullWidth
          label="SMTP Password"
          type="password"
          value={localSettings['email.smtp_pass'] || ''}
          onChange={(e) => handleSettingChange('email.smtp_pass', e.target.value)}
        />
      </Grid>
      <Grid item xs={12}>
        <TextField
          fullWidth
          label="From Email Address"
          type="email"
          value={localSettings['email.from_address'] || ''}
          onChange={(e) => handleSettingChange('email.from_address', e.target.value)}
        />
      </Grid>
    </Grid>
  );

  const renderBackupSettings = () => (
    <Grid container spacing={3}>
      <Grid item xs={12} md={6}>
        <FormGroup>
          <FormControlLabel
            control={
              <Switch
                checked={localSettings['backup.auto_backup'] === 'true'}
                onChange={(e) => handleSettingChange('backup.auto_backup', e.target.checked.toString())}
              />
            }
            label="Enable Auto Backup"
          />
        </FormGroup>
      </Grid>
      <Grid item xs={12} md={6}>
        <FormControl fullWidth>
          <InputLabel>Backup Frequency</InputLabel>
          <Select
            value={localSettings['backup.frequency'] || 'daily'}
            onChange={(e) => handleSettingChange('backup.frequency', e.target.value)}
          >
            <MenuItem value="daily">Daily</MenuItem>
            <MenuItem value="weekly">Weekly</MenuItem>
            <MenuItem value="monthly">Monthly</MenuItem>
          </Select>
        </FormControl>
      </Grid>
      <Grid item xs={12} md={6}>
        <TextField
          fullWidth
          label="Retention Days"
          type="number"
          value={localSettings['backup.retention_days'] || ''}
          onChange={(e) => handleSettingChange('backup.retention_days', e.target.value)}
        />
      </Grid>
      <Grid item xs={12} md={6}>
        <TextField
          fullWidth
          label="Backup Storage Path"
          value={localSettings['backup.storage_path'] || ''}
          onChange={(e) => handleSettingChange('backup.storage_path', e.target.value)}
        />
      </Grid>
    </Grid>
  );

  const renderTabContent = () => {
    const tabKey = tabs[activeTab]?.key;
    switch (tabKey) {
      case 'company':
        return renderCompanySettings();
      case 'invoice':
        return renderInvoiceSettings();
      case 'pos':
        return renderPOSSettings();
      case 'inventory':
        return renderInventorySettings();
      case 'finance':
        return renderFinanceSettings();
      case 'system':
        return renderSystemSettings();
      case 'security':
        return renderSecuritySettings();
      case 'email':
        return renderEmailSettings();
      case 'backup':
        return renderBackupSettings();
      default:
        return null;
    }
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Paper sx={{ mb: 3 }}>
        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tabs
            value={activeTab}
            onChange={handleTabChange}
            variant="scrollable"
            scrollButtons="auto"
          >
            {tabs.map((tab, index) => (
              <Tab
                key={tab.key}
                label={tab.label}
                icon={tab.icon}
                iconPosition="start"
              />
            ))}
          </Tabs>
        </Box>
      </Paper>

      <Paper sx={{ p: 3 }}>
        {renderTabContent()}
        
        <Divider sx={{ my: 3 }} />
        
        <Box display="flex" gap={2} justifyContent="flex-end">
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={handleReset}
          >
            Reset to Defaults
          </Button>
          <Button
            variant="contained"
            startIcon={saving ? <CircularProgress size={20} /> : <SaveIcon />}
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? 'Saving...' : 'Save Settings'}
          </Button>
        </Box>
      </Paper>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
      >
        <Alert severity={snackbar.severity} onClose={() => setSnackbar({ ...snackbar, open: false })}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default SettingsManager;