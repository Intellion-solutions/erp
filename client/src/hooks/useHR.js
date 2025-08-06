import { useState, useEffect, useCallback } from 'react';
import { useSocket } from './useSocket';

export function useHR() {
  const [employees, setEmployees] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [payroll, setPayroll] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const { socket } = useSocket();

  // Fetch all HR data
  const fetchHRData = useCallback(async () => {
    setLoading(true);
    try {
      const [empRes, attRes, payRes] = await Promise.all([
        fetch('/api/hr/employees').then(r => r.json()),
        fetch('/api/hr/attendance').then(r => r.json()),
        fetch('/api/hr/payroll').then(r => r.json()),
      ]);
      setEmployees(empRes);
      setAttendance(attRes);
      setPayroll(payRes);
      setError(null);
    } catch (err) {
      setError(err);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchHRData();
    if (socket) {
      socket.on('employeeUpdated', fetchHRData);
      socket.on('attendanceRecorded', fetchHRData);
      socket.on('payrollUpdated', fetchHRData);
    }
    return () => {
      if (socket) {
        socket.off('employeeUpdated', fetchHRData);
        socket.off('attendanceRecorded', fetchHRData);
        socket.off('payrollUpdated', fetchHRData);
      }
    };
  }, [fetchHRData, socket]);

  // CRUD methods
  const createEmployee = async (data) => {
    const res = await fetch('/api/hr/employees', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Failed to create employee');
    await fetchHRData();
  };

  const updateEmployee = async (id, data) => {
    const res = await fetch(`/api/hr/employees/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Failed to update employee');
    await fetchHRData();
  };

  const clockIn = async (data) => {
    const res = await fetch('/api/hr/attendance/clock-in', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Failed to clock in');
    await fetchHRData();
  };

  const clockOut = async (data) => {
    const res = await fetch('/api/hr/attendance/clock-out', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Failed to clock out');
    await fetchHRData();
  };

  const generatePayroll = async (data) => {
    const res = await fetch('/api/hr/payroll', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Failed to generate payroll');
    await fetchHRData();
  };

  const getAttendanceReport = async (params = {}) => {
    const query = new URLSearchParams(params).toString();
    const res = await fetch(`/api/hr/attendance/report?${query}`);
    if (!res.ok) throw new Error('Failed to fetch attendance report');
    return await res.json();
  };

  return {
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
  };
}