import { useState, useEffect, useCallback } from 'react';
import { useSocket } from './useSocket';

export function useNotifications() {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const { socket } = useSocket();

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/notifications', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      const data = await res.json();
      setNotifications(data);
      setError(null);
    } catch (err) {
      setError(err);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchNotifications();
    if (socket) {
      socket.on('notificationCreated', fetchNotifications);
      socket.on('notificationRead', fetchNotifications);
      socket.on('notificationDeleted', fetchNotifications);
    }
    return () => {
      if (socket) {
        socket.off('notificationCreated', fetchNotifications);
        socket.off('notificationRead', fetchNotifications);
        socket.off('notificationDeleted', fetchNotifications);
      }
    };
  }, [fetchNotifications, socket]);

  const markAsRead = async (id) => {
    const res = await fetch(`/api/notifications/${id}/read`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
    });
    if (!res.ok) throw new Error('Failed to mark notification as read');
    await fetchNotifications();
  };

  const deleteNotification = async (id) => {
    const res = await fetch(`/api/notifications/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
    });
    if (!res.ok) throw new Error('Failed to delete notification');
    await fetchNotifications();
  };

  return {
    notifications,
    loading,
    error,
    markAsRead,
    deleteNotification
  };
}