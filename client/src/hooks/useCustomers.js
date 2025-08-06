import { useState, useEffect, useCallback } from 'react';
import { useSocket } from './useSocket';

export function useCustomers() {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const { socket } = useSocket();

  const fetchCustomers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/customers');
      const data = await res.json();
      setCustomers(data);
      setError(null);
    } catch (err) {
      setError(err);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchCustomers();
    if (socket) {
      socket.on('customerUpdated', fetchCustomers);
    }
    return () => {
      if (socket) {
        socket.off('customerUpdated', fetchCustomers);
      }
    };
  }, [fetchCustomers, socket]);

  const createCustomer = async (data) => {
    const res = await fetch('/api/customers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Failed to create customer');
    await fetchCustomers();
  };

  const updateCustomer = async (id, data) => {
    const res = await fetch(`/api/customers/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Failed to update customer');
    await fetchCustomers();
  };

  const deleteCustomer = async (id) => {
    const res = await fetch(`/api/customers/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
    });
    if (!res.ok) throw new Error('Failed to delete customer');
    await fetchCustomers();
  };

  return {
    customers,
    loading,
    error,
    createCustomer,
    updateCustomer,
    deleteCustomer
  };
}