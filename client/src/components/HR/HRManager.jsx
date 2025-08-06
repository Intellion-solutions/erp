import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Grid,
  Card,
  CardContent,
  IconButton,
  Chip,
  Alert,
  Snackbar,
  CircularProgress,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Autocomplete,
  Divider,
  Tooltip,
  SpeedDial,
  SpeedDialAction,
  SpeedDialIcon,
  Tabs,
  Tab,
  Avatar,
  Badge,
  List,
  ListItem,
  ListItemText,
  ListItemAvatar,
  Calendar,
  LinearProgress
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  People as PeopleIcon,
  Work as WorkIcon,
  AttachMoney as AttachMoneyIcon,
  Schedule as ScheduleIcon,
  Search as SearchIcon,
  FilterList as FilterIcon,
  Download as DownloadIcon,
  Refresh as RefreshIcon,
  Visibility as ViewIcon,
  Print as PrintIcon,
  PersonAdd as PersonAddIcon,
  AccessTime as AccessTimeIcon,
  Payment as PaymentIcon,
  Assessment as AssessmentIcon,
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  CheckCircle as CheckCircleIcon,
  Cancel as CancelIcon,
  Warning as WarningIcon
} from '@mui/icons-material';
import { useHR } from '../../hooks/useHR';
import { useSocket } from '../../hooks/useSocket';
import { useSettings } from '../../hooks/useSettings';

const HRManager = () => {
  const { 
    employees, 
    attendance, 
    payroll, 
    loading, 
    error,
    createEmployee,
    updateEmployee,
    clockIn,
    clockOut,
    generatePayroll,
    getAttendanceReport
  } = useHR();
  const { socket } = useSocket();
  const { settings } = useSettings();
  
  const [activeTab, setActiveTab] = useState(0);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [searchTerm, setSearchTerm] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  
  const [employeeDialogOpen, setEmployeeDialogOpen] = useState(false);
  const [attendanceDialogOpen, setAttendanceDialogOpen] = useState(false);
  const [payrollDialogOpen, setPayrollDialogOpen] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
  
  const [newEmployee, setNewEmployee] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    department: '',
    position: '',
    salary: 0,
    hireDate: new Date().toISOString().split('T')[0],
    status: 'ACTIVE'
  });

  const [attendanceData, setAttendanceData] = useState({
    employeeId: '',
    type: 'CLOCK_IN',
    notes: ''
  });

  const [payrollData, setPayrollData] = useState({
    employeeId: '',
    period: '',
    basicSalary: 0,
    allowances: 0,
    deductions: 0,
    netSalary: 0
  });

  const [hrStats, setHrStats] = useState({
    totalEmployees: 0,
    activeEmployees: 0,
    presentToday: 0,
    absentToday: 0,
    totalPayroll: 0
  });

  useEffect(() => {
    if (socket) {
      socket.on('employeeUpdated', (data) => {
        setSnackbar({
          open: true,
          message: `Employee ${data.firstName} ${data.lastName} updated`,
          severity: 'info'
        });
      });

      socket.on('attendanceRecorded', (data) => {
        setSnackbar({
          open: true,
          message: `${data.type} recorded for ${data.employeeName}`,
          severity: 'success'
        });
      });
    }

    return () => {
      if (socket) {
        socket.off('employeeUpdated');
        socket.off('attendanceRecorded');
      }
    };
  }, [socket]);

  useEffect(() => {
    // Calculate HR statistics
    if (employees) {
      const total = employees.length;
      const active = employees.filter(emp => emp.status === 'ACTIVE').length;
      const present = attendance?.filter(att => 
        new Date(att.date).toDateString() === new Date().toDateString() && 
        att.type === 'CLOCK_IN'
      ).length || 0;
      const absent = total - present;
      const totalPayroll = employees.reduce((sum, emp) => sum + (emp.salary || 0), 0);

      setHrStats({
        totalEmployees: total,
        activeEmployees: active,
        presentToday: present,
        absentToday: absent,
        totalPayroll
      });
    }
  }, [employees, attendance]);

  const handleCreateEmployee = async () => {
    try {
      await createEmployee(newEmployee);
      setEmployeeDialogOpen(false);
      setNewEmployee({
        firstName: '',
        lastName: '',
        email: '',
        phone: '',
        department: '',
        position: '',
        salary: 0,
        hireDate: new Date().toISOString().split('T')[0],
        status: 'ACTIVE'
      });
      setSnackbar({
        open: true,
        message: 'Employee created successfully',
        severity: 'success'
      });
    } catch (error) {
      setSnackbar({
        open: true,
        message: 'Failed to create employee',
        severity: 'error'
      });
    }
  };

  const handleClockInOut = async () => {
    try {
      if (attendanceData.type === 'CLOCK_IN') {
        await clockIn(attendanceData);
      } else {
        await clockOut(attendanceData);
      }
      setAttendanceDialogOpen(false);
      setAttendanceData({ employeeId: '', type: 'CLOCK_IN', notes: '' });
      setSnackbar({
        open: true,
        message: `${attendanceData.type === 'CLOCK_IN' ? 'Clock in' : 'Clock out'} recorded successfully`,
        severity: 'success'
      });
    } catch (error) {
      setSnackbar({
        open: true,
        message: 'Failed to record attendance',
        severity: 'error'
      });
    }
  };

  const getEmployeeStatusColor = (status) => {
    switch (status) {
      case 'ACTIVE': return 'success';
      case 'INACTIVE': return 'default';
      case 'SUSPENDED': return 'warning';
      case 'TERMINATED': return 'error';
      default: return 'default';
    }
  };

  const getAttendanceStatus = (employee) => {
    const todayAttendance = attendance?.find(att => 
      att.employeeId === employee.id && 
      new Date(att.date).toDateString() === new Date().toDateString()
    );
    
    if (!todayAttendance) return { status: 'Absent', color: 'error', icon: <CancelIcon /> };
    if (todayAttendance.type === 'CLOCK_IN') return { status: 'Present', color: 'success', icon: <CheckCircleIcon /> };
    return { status: 'Clocked Out', color: 'warning', icon: <WarningIcon /> };
  };

  const calculateWorkHours = (employee) => {
    const todayAttendance = attendance?.filter(att => 
      att.employeeId === employee.id && 
      new Date(att.date).toDateString() === new Date().toDateString()
    );
    
    if (!todayAttendance || todayAttendance.length < 2) return 0;
    
    const clockIn = new Date(todayAttendance.find(att => att.type === 'CLOCK_IN')?.timestamp);
    const clockOut = new Date(todayAttendance.find(att => att.type === 'CLOCK_OUT')?.timestamp);
    
    return Math.round((clockOut - clockIn) / (1000 * 60 * 60));
  };

  const tabs = [
    { label: 'Employees', icon: <PeopleIcon /> },
    { label: 'Attendance', icon: <ScheduleIcon /> },
    { label: 'Payroll', icon: <AttachMoneyIcon /> },
    { label: 'Reports', icon: <AssessmentIcon /> }
  ];

  const actions = [
    { icon: <PersonAddIcon />, name: 'Add Employee', action: () => setEmployeeDialogOpen(true) },
    { icon: <AccessTimeIcon />, name: 'Record Attendance', action: () => setAttendanceDialogOpen(true) },
    { icon: <PaymentIcon />, name: 'Generate Payroll', action: () => setPayrollDialogOpen(true) },
    { icon: <DownloadIcon />, name: 'Export Report', action: () => console.log('Export') },
    { icon: <RefreshIcon />, name: 'Refresh', action: () => window.location.reload() }
  ];

  const renderEmployees = () => (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
        <Typography variant="h6">Employees</Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setEmployeeDialogOpen(true)}
        >
          Add Employee
        </Button>
      </Box>
      
      <Paper>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Employee</TableCell>
                <TableCell>Department</TableCell>
                <TableCell>Position</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Attendance</TableCell>
                <TableCell>Work Hours</TableCell>
                <TableCell>Salary</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {employees?.map((employee) => {
                const attendanceStatus = getAttendanceStatus(employee);
                const workHours = calculateWorkHours(employee);
                
                return (
                  <TableRow key={employee.id}>
                    <TableCell>
                      <Box display="flex" alignItems="center" gap={2}>
                        <Avatar>{employee.firstName.charAt(0)}</Avatar>
                        <Box>
                          <Typography variant="subtitle2" fontWeight="bold">
                            {employee.firstName} {employee.lastName}
                          </Typography>
                          <Typography variant="caption" color="textSecondary">
                            {employee.email}
                          </Typography>
                        </Box>
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Chip label={employee.department} size="small" variant="outlined" />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">
                        {employee.position}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={employee.status}
                        color={getEmployeeStatusColor(employee.status)}
                        size="small"
                      />
                    </TableCell>
                    <TableCell>
                      <Chip
                        icon={attendanceStatus.icon}
                        label={attendanceStatus.status}
                        color={attendanceStatus.color}
                        size="small"
                      />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">
                        {workHours}h
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" fontWeight="bold">
                        ${employee.salary?.toFixed(2)}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Box display="flex" gap={1}>
                        <Tooltip title="View Details">
                          <IconButton size="small" onClick={() => setSelectedEmployee(employee)}>
                            <ViewIcon />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Edit">
                          <IconButton size="small">
                            <EditIcon />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Record Attendance">
                          <IconButton 
                            size="small" 
                            onClick={() => {
                              setAttendanceData(prev => ({ ...prev, employeeId: employee.id }));
                              setAttendanceDialogOpen(true);
                            }}
                          >
                            <AccessTimeIcon />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination
          rowsPerPageOptions={[5, 10, 25]}
          component="div"
          count={employees?.length || 0}
          rowsPerPage={rowsPerPage}
          page={page}
          onPageChange={(event, newPage) => setPage(newPage)}
          onRowsPerPageChange={(event) => {
            setRowsPerPage(parseInt(event.target.value, 10));
            setPage(0);
          }}
        />
      </Paper>
    </Box>
  );

  const renderAttendance = () => (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
        <Typography variant="h6">Attendance</Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setAttendanceDialogOpen(true)}
        >
          Record Attendance
        </Button>
      </Box>
      
      <Paper>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Employee</TableCell>
                <TableCell>Date</TableCell>
                <TableCell>Type</TableCell>
                <TableCell>Time</TableCell>
                <TableCell>Notes</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {attendance?.map((record) => (
                <TableRow key={record.id}>
                  <TableCell>
                    <Box display="flex" alignItems="center" gap={2}>
                      <Avatar>{record.employee?.firstName?.charAt(0)}</Avatar>
                      <Typography variant="body2">
                        {record.employee?.firstName} {record.employee?.lastName}
                      </Typography>
                    </Box>
                  </TableCell>
                  <TableCell>
                    {new Date(record.date).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={record.type}
                      color={record.type === 'CLOCK_IN' ? 'success' : 'warning'}
                      size="small"
                    />
                  </TableCell>
                  <TableCell>
                    {new Date(record.timestamp).toLocaleTimeString()}
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">
                      {record.notes || '-'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Box display="flex" gap={1}>
                      <Tooltip title="View Details">
                        <IconButton size="small">
                          <ViewIcon />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Edit">
                        <IconButton size="small">
                          <EditIcon />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </Box>
  );

  const renderPayroll = () => (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
        <Typography variant="h6">Payroll</Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setPayrollDialogOpen(true)}
        >
          Generate Payroll
        </Button>
      </Box>
      
      <Paper>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Employee</TableCell>
                <TableCell>Period</TableCell>
                <TableCell>Basic Salary</TableCell>
                <TableCell>Allowances</TableCell>
                <TableCell>Deductions</TableCell>
                <TableCell>Net Salary</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {payroll?.map((record) => (
                <TableRow key={record.id}>
                  <TableCell>
                    <Box display="flex" alignItems="center" gap={2}>
                      <Avatar>{record.employee?.firstName?.charAt(0)}</Avatar>
                      <Typography variant="body2">
                        {record.employee?.firstName} {record.employee?.lastName}
                      </Typography>
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">
                      {record.period}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" fontWeight="bold">
                      ${record.basicSalary?.toFixed(2)}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" color="success.main">
                      +${record.allowances?.toFixed(2)}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" color="error">
                      -${record.deductions?.toFixed(2)}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" fontWeight="bold">
                      ${record.netSalary?.toFixed(2)}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={record.status}
                      color={record.status === 'PAID' ? 'success' : 'warning'}
                      size="small"
                    />
                  </TableCell>
                  <TableCell>
                    <Box display="flex" gap={1}>
                      <Tooltip title="View Details">
                        <IconButton size="small">
                          <ViewIcon />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Print Payslip">
                        <IconButton size="small">
                          <PrintIcon />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </Box>
  );

  const renderReports = () => (
    <Box>
      <Typography variant="h6" gutterBottom>HR Reports</Typography>
      
      <Grid container spacing={3}>
        {/* Employee Statistics */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Employee Statistics
              </Typography>
              <List>
                <ListItem>
                  <ListItemText
                    primary="Total Employees"
                    secondary={hrStats.totalEmployees}
                  />
                  <TrendingUpIcon color="primary" />
                </ListItem>
                <ListItem>
                  <ListItemText
                    primary="Active Employees"
                    secondary={hrStats.activeEmployees}
                  />
                  <CheckCircleIcon color="success" />
                </ListItem>
                <ListItem>
                  <ListItemText
                    primary="Present Today"
                    secondary={hrStats.presentToday}
                  />
                  <CheckCircleIcon color="success" />
                </ListItem>
                <ListItem>
                  <ListItemText
                    primary="Absent Today"
                    secondary={hrStats.absentToday}
                  />
                  <CancelIcon color="error" />
                </ListItem>
              </List>
            </CardContent>
          </Card>
        </Grid>

        {/* Payroll Summary */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Payroll Summary
              </Typography>
              <Box>
                <Typography variant="h4" color="primary" gutterBottom>
                  ${hrStats.totalPayroll?.toFixed(2)}
                </Typography>
                <Typography variant="body2" color="textSecondary">
                  Total Monthly Payroll
                </Typography>
              </Box>
              <LinearProgress 
                variant="determinate" 
                value={(hrStats.presentToday / hrStats.totalEmployees) * 100} 
                sx={{ mt: 2 }}
              />
              <Typography variant="caption" color="textSecondary">
                Attendance Rate: {((hrStats.presentToday / hrStats.totalEmployees) * 100).toFixed(1)}%
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );

  const renderTabContent = () => {
    switch (activeTab) {
      case 0:
        return renderEmployees();
      case 1:
        return renderAttendance();
      case 2:
        return renderPayroll();
      case 3:
        return renderReports();
      default:
        return null;
    }
  };

  return (
    <Box>
      {/* Header */}
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4" component="h1">
          HR Management
        </Typography>
      </Box>

      {/* Summary Cards */}
      <Grid container spacing={3} mb={3}>
        <Grid item xs={12} md={2.4}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" justifyContent="space-between">
                <Box>
                  <Typography color="textSecondary" gutterBottom>
                    Total Employees
                  </Typography>
                  <Typography variant="h4">
                    {hrStats.totalEmployees}
                  </Typography>
                </Box>
                <PeopleIcon color="primary" sx={{ fontSize: 40 }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={2.4}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" justifyContent="space-between">
                <Box>
                  <Typography color="textSecondary" gutterBottom>
                    Active Employees
                  </Typography>
                  <Typography variant="h4" color="success.main">
                    {hrStats.activeEmployees}
                  </Typography>
                </Box>
                <CheckCircleIcon color="success" sx={{ fontSize: 40 }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={2.4}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" justifyContent="space-between">
                <Box>
                  <Typography color="textSecondary" gutterBottom>
                    Present Today
                  </Typography>
                  <Typography variant="h4" color="success.main">
                    {hrStats.presentToday}
                  </Typography>
                </Box>
                <AccessTimeIcon color="success" sx={{ fontSize: 40 }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={2.4}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" justifyContent="space-between">
                <Box>
                  <Typography color="textSecondary" gutterBottom>
                    Absent Today
                  </Typography>
                  <Typography variant="h4" color="error.main">
                    {hrStats.absentToday}
                  </Typography>
                </Box>
                <CancelIcon color="error" sx={{ fontSize: 40 }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={2.4}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" justifyContent="space-between">
                <Box>
                  <Typography color="textSecondary" gutterBottom>
                    Total Payroll
                  </Typography>
                  <Typography variant="h4" color="primary">
                    ${hrStats.totalPayroll?.toFixed(0)}
                  </Typography>
                </Box>
                <AttachMoneyIcon color="primary" sx={{ fontSize: 40 }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Tabs */}
      <Paper sx={{ mb: 3 }}>
        <Tabs
          value={activeTab}
          onChange={(event, newValue) => setActiveTab(newValue)}
          variant="scrollable"
          scrollButtons="auto"
        >
          {tabs.map((tab, index) => (
            <Tab
              key={tab.label}
              label={tab.label}
              icon={tab.icon}
              iconPosition="start"
            />
          ))}
        </Tabs>
      </Paper>

      {/* Tab Content */}
      {renderTabContent()}

      {/* Create Employee Dialog */}
      <Dialog
        open={employeeDialogOpen}
        onClose={() => setEmployeeDialogOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>Add New Employee</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="First Name"
                value={newEmployee.firstName}
                onChange={(e) => setNewEmployee(prev => ({ ...prev, firstName: e.target.value }))}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Last Name"
                value={newEmployee.lastName}
                onChange={(e) => setNewEmployee(prev => ({ ...prev, lastName: e.target.value }))}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Email"
                type="email"
                value={newEmployee.email}
                onChange={(e) => setNewEmployee(prev => ({ ...prev, email: e.target.value }))}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Phone"
                value={newEmployee.phone}
                onChange={(e) => setNewEmployee(prev => ({ ...prev, phone: e.target.value }))}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Department"
                value={newEmployee.department}
                onChange={(e) => setNewEmployee(prev => ({ ...prev, department: e.target.value }))}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Position"
                value={newEmployee.position}
                onChange={(e) => setNewEmployee(prev => ({ ...prev, position: e.target.value }))}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                type="number"
                label="Salary"
                value={newEmployee.salary}
                onChange={(e) => setNewEmployee(prev => ({ ...prev, salary: parseFloat(e.target.value) || 0 }))}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                type="date"
                label="Hire Date"
                value={newEmployee.hireDate}
                onChange={(e) => setNewEmployee(prev => ({ ...prev, hireDate: e.target.value }))}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <FormControl fullWidth>
                <InputLabel>Status</InputLabel>
                <Select
                  value={newEmployee.status}
                  onChange={(e) => setNewEmployee(prev => ({ ...prev, status: e.target.value }))}
                >
                  <MenuItem value="ACTIVE">Active</MenuItem>
                  <MenuItem value="INACTIVE">Inactive</MenuItem>
                  <MenuItem value="SUSPENDED">Suspended</MenuItem>
                </Select>
              </FormControl>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEmployeeDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleCreateEmployee}
            disabled={!newEmployee.firstName || !newEmployee.lastName || !newEmployee.email}
          >
            Create Employee
          </Button>
        </DialogActions>
      </Dialog>

      {/* Attendance Dialog */}
      <Dialog
        open={attendanceDialogOpen}
        onClose={() => setAttendanceDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Record Attendance</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12}>
              <Autocomplete
                options={employees || []}
                getOptionLabel={(option) => `${option.firstName} ${option.lastName}`}
                value={employees?.find(emp => emp.id === attendanceData.employeeId) || null}
                onChange={(event, newValue) => {
                  setAttendanceData(prev => ({ ...prev, employeeId: newValue?.id || '' }));
                }}
                renderInput={(params) => (
                  <TextField {...params} label="Employee" fullWidth />
                )}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <FormControl fullWidth>
                <InputLabel>Type</InputLabel>
                <Select
                  value={attendanceData.type}
                  onChange={(e) => setAttendanceData(prev => ({ ...prev, type: e.target.value }))}
                >
                  <MenuItem value="CLOCK_IN">Clock In</MenuItem>
                  <MenuItem value="CLOCK_OUT">Clock Out</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                multiline
                rows={3}
                label="Notes"
                value={attendanceData.notes}
                onChange={(e) => setAttendanceData(prev => ({ ...prev, notes: e.target.value }))}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAttendanceDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleClockInOut}
            disabled={!attendanceData.employeeId}
          >
            Record Attendance
          </Button>
        </DialogActions>
      </Dialog>

      {/* Speed Dial */}
      <SpeedDial
        ariaLabel="HR actions"
        sx={{ position: 'fixed', bottom: 16, right: 16 }}
        icon={<SpeedDialIcon />}
      >
        {actions.map((action) => (
          <SpeedDialAction
            key={action.name}
            icon={action.icon}
            tooltipTitle={action.name}
            onClick={action.action}
          />
        ))}
      </SpeedDial>

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

export default HRManager;