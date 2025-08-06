import { useState, useEffect, useCallback } from 'react';
import { useSocket } from './useSocket';

export function useSettings() {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const { socket } = useSocket();

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/settings', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      const data = await res.json();
      setSettings(data);
      setError(null);
    } catch (err) {
      setError(err);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchSettings();
    if (socket) {
      socket.on('settingUpdated', fetchSettings);
      socket.on('settingsReset', fetchSettings);
    }
    return () => {
      if (socket) {
        socket.off('settingUpdated', fetchSettings);
        socket.off('settingsReset', fetchSettings);
      }
    };
  }, [fetchSettings, socket]);

  const updateSettings = async (newSettings) => {
    setLoading(true);
    try {
      const res = await fetch('/api/settings/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify({ settings: newSettings })
      });
      if (!res.ok) throw new Error('Failed to update settings');
      await fetchSettings();
    } catch (err) {
      setError(err);
    }
    setLoading(false);
  };

  return {
    settings,
    loading,
    error,
    updateSettings
  };
}