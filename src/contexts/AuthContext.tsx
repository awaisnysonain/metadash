import React, { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import type { AppUser, Permission } from '../types';
import { apiClient } from '../services/apiClient';

const TOKEN_KEY = 'metadash_token';

interface AuthContextValue {
  user: AppUser | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  updateProfile: (fields: Partial<Pick<AppUser, 'name' | 'email' | 'title' | 'bio' | 'avatarUrl'>>) => Promise<void>;
  hasPermission: (permission: Permission) => boolean;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [isLoading, setIsLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    const t = localStorage.getItem(TOKEN_KEY);
    if (!t) {
      setUser(null);
      setToken(null);
      setIsLoading(false);
      return;
    }
    try {
      apiClient.setToken(t);
      const { user: me } = await apiClient.getMe();
      setUser(me);
      setToken(t);
    } catch {
      localStorage.removeItem(TOKEN_KEY);
      apiClient.setToken(null);
      setUser(null);
      setToken(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshUser();
  }, [refreshUser]);

  const login = useCallback(async (username: string, password: string) => {
    const { token: t, user: u } = await apiClient.login(username, password);
    localStorage.setItem(TOKEN_KEY, t);
    apiClient.setToken(t);
    setToken(t);
    setUser(u);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    apiClient.setToken(null);
    setToken(null);
    setUser(null);
  }, []);

  const updateProfile = useCallback(async (fields: Partial<Pick<AppUser, 'name' | 'email' | 'title' | 'bio' | 'avatarUrl'>>) => {
    const { user: updated } = await apiClient.updateProfile(fields);
    setUser(updated);
  }, []);

  const hasPermission = useCallback(
    (permission: Permission) => {
      if (!user) return false;
      if (user.role === 'admin') return true;
      return Array.isArray(user.permissions) && user.permissions.includes(permission);
    },
    [user]
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        isAuthenticated: Boolean(user && token),
        login,
        logout,
        updateProfile,
        hasPermission,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
