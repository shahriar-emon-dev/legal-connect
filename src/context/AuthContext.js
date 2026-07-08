import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '../services/supabase';

/**
 * AuthContext — single source of truth for authentication state using Supabase directly.
 */

const AuthContext = createContext({
  user: null,
  loading: true,
  isAuthenticated: false,
  setUser: () => {},
  logout: () => {},
});

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Check auth state on initial mount
  useEffect(() => {
    let cancelled = false;

    const fetchPublicUser = async (email) => {
      const { data, error } = await supabase.from('users').select('id, auth_id, user_type, role, name, profile_picture_url').eq('email', email).maybeSingle();
      if (error && error.code !== 'PGRST116') {
        console.warn(`AuthContext: fetch public user error:`, error);
      }
      return data;
    };

    const checkAuth = async () => {
      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;

        if (!cancelled && session?.user) {
          const u = session.user;
          const publicUser = await fetchPublicUser(u.email);
          if (!cancelled) {
            if (publicUser) {
              console.log('Session restored successfully for:', u.email);
              setUser({ 
                ...u, 
                ...u.user_metadata, 
                ...publicUser, 
                full_name: publicUser.name || u.user_metadata?.full_name,
                profile_picture_url: publicUser.profile_picture_url || u.user_metadata?.avatar_url || u.user_metadata?.profile_picture_url,
                id: publicUser.id, 
                auth_id: u.id 
              });
            } else {
              console.warn('User record missing in public.users (account deleted/dropped). Signing out:', u.email);
              await supabase.auth.signOut();
              setUser(null);
            }
          }
        } else if (!cancelled) {
          setUser(null);
        }
      } catch (err) {
        console.error('Auth check initialization error:', err);
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    checkAuth();

    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!cancelled) {
          try {
            console.log('Auth state event fired:', event);
            if (session?.user) {
              const u = session.user;
              const publicUser = await fetchPublicUser(u.email);
              if (!cancelled) {
                if (publicUser) {
                  setUser({ 
                    ...u, 
                    ...u.user_metadata, 
                    ...publicUser, 
                    full_name: publicUser.name || u.user_metadata?.full_name,
                    profile_picture_url: publicUser.profile_picture_url || u.user_metadata?.avatar_url || u.user_metadata?.profile_picture_url,
                    id: publicUser.id, 
                    auth_id: u.id 
                  });
                } else {
                  console.warn('User record missing in public.users (account deleted/dropped). Signing out:', u.email);
                  await supabase.auth.signOut();
                  setUser(null);
                }
              }
            } else {
              setUser(null);
            }
          } catch (err) {
             console.error('Auth state change listener error:', err);
             if (!cancelled) setUser(null);
          } finally {
             if (!cancelled) setLoading(false);
          }
        }
      }
    );

    return () => {
      cancelled = true;
      if (authListener?.subscription) {
        authListener.subscription.unsubscribe();
      }
    };
  }, []);

  const logout = useCallback(async () => {
    try {
      await supabase.auth.signOut();
    } catch {
      // best-effort
    }
    setUser(null);
  }, []);

  const value = {
    user,
    userType: user?.user_type || null,
    loading,
    isAuthenticated: !!user,
    setUser,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}

export default AuthContext;
