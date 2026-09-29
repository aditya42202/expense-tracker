import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import api from '../services/api';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('user');
    return saved ? JSON.parse(saved) : null;
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadUser = async () => {
      const token = localStorage.getItem('access_token');
      if (!token) {
        setLoading(false);
        return;
      }

      try {
        const { data } = await api.get('/auth/profile/');
        setUser(data);
        localStorage.setItem('user', JSON.stringify(data));
      } catch (error) {
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        localStorage.removeItem('user');
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    loadUser();
  }, []);

  const login = async (payload) => {
    const { data } = await api.post('/auth/login/', payload);
    if (data.access && data.refresh && data.user) {
      localStorage.setItem('access_token', data.access);
      localStorage.setItem('refresh_token', data.refresh);
      localStorage.setItem('user', JSON.stringify(data.user));
      setUser(data.user);
    }
    return data;
  };

  const verifyLoginOtp = async (payload) => {
    const { data } = await api.post('/auth/login/verify-otp/', payload);
    localStorage.setItem('access_token', data.access);
    localStorage.setItem('refresh_token', data.refresh);
    localStorage.setItem('user', JSON.stringify(data.user));
    setUser(data.user);
    return data;
  };

  const resendLoginOtp = async (payload) => {
    const { data } = await api.post('/auth/login/resend-otp/', payload);
    return data;
  };

  const register = async (payload) => {
    const { data } = await api.post('/auth/register/', payload);
    return data;
  };

  const verifyEmail = async (payload) => {
    const { data } = await api.post('/auth/verify-otp/', payload);
    return data;
  };

  const resendOtp = async (payload) => {
    const { data } = await api.post('/auth/resend-otp/', payload);
    return data;
  };

  const logout = async () => {
    try {
      const refreshToken = localStorage.getItem('refresh_token');
      if (refreshToken) {
        await api.post('/auth/logout/', { refresh: refreshToken });
      }
    } catch (error) {
      console.error('Logout failed', error);
    } finally {
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
      localStorage.removeItem('user');
      setUser(null);
    }
  };

  const value = useMemo(
    () => ({ user, loading, login, verifyLoginOtp, resendLoginOtp, register, verifyEmail, resendOtp, logout, setUser }),
    [user, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
