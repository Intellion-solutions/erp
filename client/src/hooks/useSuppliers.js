import { useState, useEffect, useCallback } from 'react';
import { useSocket } from './useSocket';

export function useSuppliers() {
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const { socket } = useSocket();

  const fetchSuppliers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/suppliers');
      const data = await res.json();
      setSuppliers(data);
      setError(null);
    } catch (err) {
      setError(err);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchSuppliers();
    if (socket) {
      socket.on('supplierUpdated', fetchSuppliers);
    }
    return () => {
      if (socket) {
        socket.off('supplierUpdated', fetchSuppliers);
      }
    };
  }, [fetchSuppliers, socket]);

  const createSupplier = async (data) => {
    const res = await fetch('/api/suppliers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Failed to create supplier');
    await fetchSuppliers();
  };

  const updateSupplier = async (id, data) => {
    const res = await fetch(`/api/suppliers/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Failed to update supplier');
    await fetchSuppliers();
  };

  const deleteSupplier = async (id) => {
    const res = await fetch(`/api/suppliers/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
    });
    if (!res.ok) throw new Error('Failed to delete supplier');
    await fetchSuppliers();
  };

  return {
    suppliers,
    loading,
    error,
    createSupplier,
    updateSupplier,
    deleteSupplier
  };
}