import { useState, useEffect, useCallback } from 'react';
import { useSocket } from './useSocket';

export function useInventory() {
  const [inventory, setInventory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const { socket } = useSocket();

  // Fetch inventory data
  const fetchInventory = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/inventory');
      const data = await res.json();
      setInventory(data);
      setError(null);
    } catch (err) {
      setError(err);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchInventory();
    if (socket) {
      socket.on('stockUpdated', fetchInventory);
      socket.on('lowStockAlert', fetchInventory);
    }
    return () => {
      if (socket) {
        socket.off('stockUpdated', fetchInventory);
        socket.off('lowStockAlert', fetchInventory);
      }
    };
  }, [fetchInventory, socket]);

  // Stock adjustment
  const updateStock = async (data) => {
    const res = await fetch('/api/inventory/adjust', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Failed to adjust stock');
    await fetchInventory();
  };

  // Alerts
  const getAlerts = async () => {
    const res = await fetch('/api/inventory/alerts');
    if (!res.ok) throw new Error('Failed to fetch alerts');
    return await res.json();
  };

  // Valuation
  const getValuation = async (method = 'FIFO') => {
    const res = await fetch(`/api/inventory/valuation?method=${method}`);
    if (!res.ok) throw new Error('Failed to fetch valuation');
    return await res.json();
  };

  // Stock movements
  const getMovements = async () => {
    const res = await fetch('/api/inventory/movements');
    if (!res.ok) throw new Error('Failed to fetch movements');
    return await res.json();
  };

  return {
    inventory,
    loading,
    error,
    updateStock,
    getAlerts,
    getValuation,
    getMovements
  };
}