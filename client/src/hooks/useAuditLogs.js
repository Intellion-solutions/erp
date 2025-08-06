import { useState, useEffect, useCallback } from 'react';
import { useSocket } from './useSocket';

export function useAuditLogs() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const { socket } = useSocket();

  const fetchLogs = useCallback(async (params = {}) => {
    setLoading(true);
    try {
      const query = new URLSearchParams(params).toString();
      const res = await fetch(`/api/audit${query ? `?${query}` : ''}`);
      const data = await res.json();
      setLogs(data);
      setError(null);
    } catch (err) {
      setError(err);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchLogs();
    if (socket) {
      socket.on('auditLogCreated', fetchLogs);
    }
    return () => {
      if (socket) {
        socket.off('auditLogCreated', fetchLogs);
      }
    };
  }, [fetchLogs, socket]);

  const exportLogs = async (params = {}, format = 'csv') => {
    const query = new URLSearchParams({ ...params, format }).toString();
    const res = await fetch(`/api/audit/export?${query}`);
    if (!res.ok) throw new Error('Failed to export audit logs');
    return await res.blob();
  };

  return {
    logs,
    loading,
    error,
    fetchLogs,
    exportLogs
  };
}