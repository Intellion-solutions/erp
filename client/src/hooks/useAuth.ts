import { useState, useEffect, useCallback } from 'react';
import { User, AuthTokens, AuthResponse } from '../types';
import { authApi } from '../services/api';
import toast from 'react-hot-toast';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  tokens: AuthTokens | null;
}

const TOKEN_KEY = 'erp_tokens';
const USER_KEY = 'erp_user';

export const useAuth = () => {
  const [state, setState] = useState<AuthState>({
    user: null,
    isAuthenticated: false,
    isLoading: true,
    tokens: null
  });

  // Initialize auth state from localStorage
  useEffect(() => {
    const initializeAuth = async () => {
      try {
        const storedTokens = localStorage.getItem(TOKEN_KEY);
        const storedUser = localStorage.getItem(USER_KEY);

        if (storedTokens && storedUser) {
          const tokens = JSON.parse(storedTokens);
          const user = JSON.parse(storedUser);

          // Verify token is still valid
          try {
            const response = await authApi.getProfile();
            setState({
              user: response.data.user,
              isAuthenticated: true,
              isLoading: false,
              tokens
            });
          } catch (error) {
            // Token invalid, try to refresh
            try {
              const refreshResponse = await authApi.refreshToken(tokens.refreshToken);
              const newTokens = {
                accessToken: refreshResponse.data.accessToken,
                refreshToken: refreshResponse.data.refreshToken
              };
              
              localStorage.setItem(TOKEN_KEY, JSON.stringify(newTokens));
              
              setState({
                user,
                isAuthenticated: true,
                isLoading: false,
                tokens: newTokens
              });
            } catch (refreshError) {
              // Refresh failed, logout
              localStorage.removeItem(TOKEN_KEY);
              localStorage.removeItem(USER_KEY);
              setState({
                user: null,
                isAuthenticated: false,
                isLoading: false,
                tokens: null
              });
            }
          }
        } else {
          setState(prev => ({ ...prev, isLoading: false }));
        }
      } catch (error) {
        console.error('Auth initialization error:', error);
        setState({
          user: null,
          isAuthenticated: false,
          isLoading: false,
          tokens: null
        });
      }
    };

    initializeAuth();
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<boolean> => {
    try {
      setState(prev => ({ ...prev, isLoading: true }));
      
      const response = await authApi.login({ email, password });
      const { user, accessToken, refreshToken } = response.data;

      const tokens = { accessToken, refreshToken };
      
      localStorage.setItem(TOKEN_KEY, JSON.stringify(tokens));
      localStorage.setItem(USER_KEY, JSON.stringify(user));

      setState({
        user,
        isAuthenticated: true,
        isLoading: false,
        tokens
      });

      toast.success(`Welcome back, ${user.firstName}!`);
      return true;
    } catch (error: any) {
      setState(prev => ({ ...prev, isLoading: false }));
      const message = error.response?.data?.error || 'Login failed';
      toast.error(message);
      return false;
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      if (state.tokens) {
        await authApi.logout();
      }
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      
      setState({
        user: null,
        isAuthenticated: false,
        isLoading: false,
        tokens: null
      });

      toast.success('Logged out successfully');
    }
  }, [state.tokens]);

  const updateProfile = useCallback(async (data: Partial<User>): Promise<boolean> => {
    try {
      const response = await authApi.updateProfile(data);
      const updatedUser = response.data.user;

      localStorage.setItem(USER_KEY, JSON.stringify(updatedUser));
      setState(prev => ({
        ...prev,
        user: updatedUser
      }));

      toast.success('Profile updated successfully');
      return true;
    } catch (error: any) {
      const message = error.response?.data?.error || 'Failed to update profile';
      toast.error(message);
      return false;
    }
  }, []);

  const changePassword = useCallback(async (currentPassword: string, newPassword: string): Promise<boolean> => {
    try {
      await authApi.changePassword({ currentPassword, newPassword });
      toast.success('Password changed successfully');
      return true;
    } catch (error: any) {
      const message = error.response?.data?.error || 'Failed to change password';
      toast.error(message);
      return false;
    }
  }, []);

  const refreshTokens = useCallback(async (): Promise<boolean> => {
    try {
      if (!state.tokens?.refreshToken) {
        throw new Error('No refresh token available');
      }

      const response = await authApi.refreshToken(state.tokens.refreshToken);
      const newTokens = {
        accessToken: response.data.accessToken,
        refreshToken: response.data.refreshToken
      };

      localStorage.setItem(TOKEN_KEY, JSON.stringify(newTokens));
      setState(prev => ({
        ...prev,
        tokens: newTokens
      }));

      return true;
    } catch (error) {
      console.error('Token refresh error:', error);
      logout();
      return false;
    }
  }, [state.tokens, logout]);

  const hasRole = useCallback((roles: string | string[]): boolean => {
    if (!state.user) return false;
    
    const allowedRoles = Array.isArray(roles) ? roles : [roles];
    return allowedRoles.includes(state.user.role);
  }, [state.user]);

  const hasPermission = useCallback((permission: string): boolean => {
    if (!state.user) return false;

    const userRole = state.user.role;
    
    // Define role-based permissions
    const permissions: Record<string, string[]> = {
      OWNER: ['*'], // All permissions
      MANAGER: [
        'users.view',
        'products.*',
        'inventory.*',
        'sales.*',
        'purchases.*',
        'reports.view',
        'customers.*',
        'suppliers.*'
      ],
      SALESPERSON: [
        'pos.*',
        'products.view',
        'inventory.view',
        'sales.create',
        'sales.view',
        'customers.create',
        'customers.view'
      ]
    };

    const rolePermissions = permissions[userRole] || [];
    
    // Check for wildcard permission
    if (rolePermissions.includes('*')) return true;
    
    // Check for exact permission
    if (rolePermissions.includes(permission)) return true;
    
    // Check for wildcard pattern (e.g., products.*)
    return rolePermissions.some(p => {
      if (p.endsWith('*')) {
        const prefix = p.slice(0, -1);
        return permission.startsWith(prefix);
      }
      return false;
    });
  }, [state.user]);

  return {
    ...state,
    login,
    logout,
    updateProfile,
    changePassword,
    refreshTokens,
    hasRole,
    hasPermission
  };
};