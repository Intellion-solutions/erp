import { useState, useEffect, useCallback } from 'react';
import { useSocket } from './useSocket';

export function usePOS() {
  const [posSettings, setPOSSettings] = useState(null);
  const [hardwareStatus, setHardwareStatus] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const { socket } = useSocket();

  const fetchPOSSettings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/pos/settings', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      const data = await res.json();
      setPOSSettings(data);
      setError(null);
    } catch (err) {
      setError(err);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchPOSSettings();
    if (socket) {
      socket.on('posSettingsUpdated', fetchPOSSettings);
      socket.on('hardwareStatus', setHardwareStatus);
    }
    return () => {
      if (socket) {
        socket.off('posSettingsUpdated', fetchPOSSettings);
        socket.off('hardwareStatus', setHardwareStatus);
      }
    };
  }, [fetchPOSSettings, socket]);

  return {
    posSettings,
    hardwareStatus,
    loading,
    error,
    fetchPOSSettings
  };
}