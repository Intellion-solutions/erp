import { useState, useEffect, useCallback } from 'react';

export function useReports() {
  const [reports, setReports] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchReport = useCallback(async (type, params = {}) => {
    setLoading(true);
    try {
      const query = new URLSearchParams(params).toString();
      const res = await fetch(`/api/reports/${type}${query ? `?${query}` : ''}`);
      const data = await res.json();
      setReports(prev => ({ ...prev, [type]: data }));
      setError(null);
      setLoading(false);
      return data;
    } catch (err) {
      setError(err);
      setLoading(false);
      throw err;
    }
  }, []);

  const exportReport = async (type, params = {}, format = 'csv') => {
    const query = new URLSearchParams({ ...params, format }).toString();
    const res = await fetch(`/api/reports/${type}/export?${query}`);
    if (!res.ok) throw new Error('Failed to export report');
    return await res.blob();
  };

  return {
    reports,
    loading,
    error,
    fetchReport,
    exportReport
  };
}