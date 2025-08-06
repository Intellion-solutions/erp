import { useState, useEffect, useCallback } from 'react';
import { useSocket } from './useSocket';

export function useThemes() {
  const [themes, setThemes] = useState([]);
  const [currentTheme, setCurrentTheme] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const { socket } = useSocket();

  const fetchThemes = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/themes');
      const data = await res.json();
      setThemes(data);
      setCurrentTheme(data.find(t => t.isDefault) || data[0] || null);
      setError(null);
    } catch (err) {
      setError(err);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchThemes();
    if (socket) {
      socket.on('themeUpdated', fetchThemes);
    }
    return () => {
      if (socket) {
        socket.off('themeUpdated', fetchThemes);
      }
    };
  }, [fetchThemes, socket]);

  const setTheme = async (id) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/themes/${id}/set-default`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (!res.ok) throw new Error('Failed to set theme');
      await fetchThemes();
    } catch (err) {
      setError(err);
    }
    setLoading(false);
  };

  return {
    themes,
    currentTheme,
    loading,
    error,
    setTheme
  };
}