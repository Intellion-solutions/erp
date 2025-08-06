import { useState, useEffect, useCallback } from 'react';
import { useSocket } from './useSocket';

export function useProducts() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const { socket } = useSocket();

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/products');
      const data = await res.json();
      setProducts(data);
      setError(null);
    } catch (err) {
      setError(err);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchProducts();
    if (socket) {
      socket.on('productUpdated', fetchProducts);
      socket.on('stockUpdated', fetchProducts);
    }
    return () => {
      if (socket) {
        socket.off('productUpdated', fetchProducts);
        socket.off('stockUpdated', fetchProducts);
      }
    };
  }, [fetchProducts, socket]);

  const createProduct = async (data) => {
    const res = await fetch('/api/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Failed to create product');
    await fetchProducts();
  };

  const updateProduct = async (id, data) => {
    const res = await fetch(`/api/products/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Failed to update product');
    await fetchProducts();
  };

  const deleteProduct = async (id) => {
    const res = await fetch(`/api/products/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
    });
    if (!res.ok) throw new Error('Failed to delete product');
    await fetchProducts();
  };

  return {
    products,
    loading,
    error,
    createProduct,
    updateProduct,
    deleteProduct
  };
}