// context/AuthContext.jsx — Supabase Auth state management
// Purpose: Provides auth state, login, signup, logout, and authHeaders via React context
// Dependencies: @supabase/supabase-js, React
// Env vars: REACT_APP_SUPABASE_URL, REACT_APP_SUPABASE_ANON_KEY (via lib/supabase.js)

import { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext(null);
const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      if (s?.user) {
        setUser({
          id: s.user.id,
          email: s.user.email,
          tier: 'retail',
        });
      }
      setLoading(false);
    });

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, s) => {
        setSession(s);
        if (s?.user) {
          setUser({
            id: s.user.id,
            email: s.user.email,
            tier: 'retail',
          });
        } else {
          setUser(null);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const login = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
    return {
      id: data.user.id,
      email: data.user.email,
      tier: 'retail',
    };
  };

  const signup = async (email, password) => {
    // Use backend signup endpoint which uses admin API to auto-confirm
    const res = await fetch(`${API}/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const result = await res.json();
    if (!res.ok) {
      throw new Error(result.detail || 'Signup failed');
    }
    // Sign in with Supabase client to establish session
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
    return {
      id: data.user.id,
      email: data.user.email,
      tier: 'retail',
    };
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
  };

  const authHeaders = () => {
    const token = session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        background: '#050505',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '12px',
        }}>
          <div style={{
            fontSize: '15px',
            fontWeight: 700,
            color: '#fff',
            letterSpacing: '0.1em',
            fontFamily: "'JetBrains Mono', monospace",
          }}>
            AFI
          </div>
          <div style={{
            width: '120px',
            height: '1px',
            background: '#0a0a0a',
            position: 'relative',
            overflow: 'hidden',
          }}>
            <div style={{
              position: 'absolute',
              top: 0,
              left: 0,
              height: '100%',
              width: '40%',
              background: '#0066FF',
              animation: 'afi-auth-scan 1.2s ease-in-out infinite',
            }} />
          </div>
          <style>{`
            @keyframes afi-auth-scan {
              0% { left: -40%; }
              100% { left: 140%; }
            }
          `}</style>
        </div>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ user, session, loading, login, signup, logout, authHeaders }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
