import { useState, useEffect, useCallback } from 'react';
import { useSocket } from './useSocket';

export function usePurchases() {
  const [purchases, setPurchases] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const { socket } = useSocket();

  const fetchPurchases = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/purchases');
      const data = await res.json();
      setPurchases(data);
      setError(null);
    } catch (err) {
      setError(err);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchPurchases();
    if (socket) {
      socket.on('purchaseCreated', fetchPurchases);
      socket.on('purchaseStatusUpdated', fetchPurchases);
    }
    return () => {
      if (socket) {
        socket.off('purchaseCreated', fetchPurchases);
        socket.off('purchaseStatusUpdated', fetchPurchases);
      }
    };
  }, [fetchPurchases, socket]);

  const createPurchase = async (data) => {
    const res = await fetch('/api/purchases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Failed to create purchase');
    await fetchPurchases();
  };

  const updatePurchase = async (id, data) => {
    const res = await fetch(`/api/purchases/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Failed to update purchase');
    await fetchPurchases();
  };

  const deletePurchase = async (id) => {
    const res = await fetch(`/api/purchases/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
    });
    if (!res.ok) throw new Error('Failed to delete purchase');
    await fetchPurchases();
  };

  return {
    purchases,
    loading,
    error,
    createPurchase,
    updatePurchase,
    deletePurchase
  };
}