import { useState, useEffect, useCallback } from 'react';
import { useSocket } from './useSocket';

export function useAdmin() {
  const [roles, setRoles] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [users, setUsers] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [themes, setThemes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const { socket } = useSocket();

  const fetchAdminData = useCallback(async () => {
    setLoading(true);
    try {
      const [rolesRes, permsRes, usersRes, sessRes, themesRes] = await Promise.all([
        fetch('/api/admin/roles').then(r => r.json()),
        fetch('/api/admin/permissions').then(r => r.json()),
        fetch('/api/admin/users').then(r => r.json()),
        fetch('/api/admin/sessions').then(r => r.json()),
        fetch('/api/admin/themes').then(r => r.json()),
      ]);
      setRoles(rolesRes);
      setPermissions(permsRes);
      setUsers(usersRes);
      setSessions(sessRes);
      setThemes(themesRes);
      setError(null);
    } catch (err) {
      setError(err);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAdminData();
    if (socket) {
      socket.on('roleUpdated', fetchAdminData);
      socket.on('permissionUpdated', fetchAdminData);
      socket.on('userUpdated', fetchAdminData);
      socket.on('sessionUpdated', fetchAdminData);
      socket.on('themeUpdated', fetchAdminData);
    }
    return () => {
      if (socket) {
        socket.off('roleUpdated', fetchAdminData);
        socket.off('permissionUpdated', fetchAdminData);
        socket.off('userUpdated', fetchAdminData);
        socket.off('sessionUpdated', fetchAdminData);
        socket.off('themeUpdated', fetchAdminData);
      }
    };
  }, [fetchAdminData, socket]);

  // Add CRUD methods as needed for roles, permissions, users, sessions, themes

  return {
    roles,
    permissions,
    users,
    sessions,
    themes,
    loading,
    error,
    fetchAdminData
  };
}