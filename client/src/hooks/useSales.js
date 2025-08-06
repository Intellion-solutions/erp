import { useState, useEffect, useCallback } from 'react';
import { useSocket } from './useSocket';

export function useSales() {
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const { socket } = useSocket();

  const fetchSales = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/sales');
      const data = await res.json();
      setSales(data);
      setError(null);
    } catch (err) {
      setError(err);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchSales();
    if (socket) {
      socket.on('saleCreated', fetchSales);
      socket.on('saleStatusUpdated', fetchSales);
    }
    return () => {
      if (socket) {
        socket.off('saleCreated', fetchSales);
        socket.off('saleStatusUpdated', fetchSales);
      }
    };
  }, [fetchSales, socket]);

  const createSale = async (data) => {
    const res = await fetch('/api/sales', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Failed to create sale');
    await fetchSales();
  };

  const updateSale = async (id, data) => {
    const res = await fetch(`/api/sales/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Failed to update sale');
    await fetchSales();
  };

  const deleteSale = async (id) => {
    const res = await fetch(`/api/sales/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
    });
    if (!res.ok) throw new Error('Failed to delete sale');
    await fetchSales();
  };

  return {
    sales,
    loading,
    error,
    createSale,
    updateSale,
    deleteSale
  };
}