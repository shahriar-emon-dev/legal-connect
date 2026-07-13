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
      const withTimeout = (promise, ms) => {
        return Promise.race([
          promise,
          new Promise((_, reject) => setTimeout(() => reject(new Error('AuthContext database query timeout')), ms))
        ]);
      };

      try {
        const { data, error } = await withTimeout(
          supabase.from('users').select('id, auth_id, user_type, name, profile_picture_url').eq('email', email).maybeSingle(),
          5000
        );
        if (error) {
          if (error.code === 'PGRST116') {
            return { _missing: true };
          }
          console.warn(`AuthContext: fetch public user error:`, error);
          return {}; // return empty object on transient error so we don't sign out
        }
        return data || { _missing: true };
      } catch (err) {
        console.warn('AuthContext: Profile fetch timed out or failed:', err);
        return {}; // return empty object on timeout so we don't sign out
      }
    };

    const checkAuth = async () => {
      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;

        if (!cancelled && session?.user) {
          const u = session.user;
          const publicUser = await fetchPublicUser(u.email);
          if (!cancelled) {
            if (publicUser && !publicUser._missing) {
              console.log('Session restored successfully for:', u.email);
              setUser({ 
                ...u, 
                ...u.user_metadata, 
                ...publicUser, 
                full_name: publicUser.name || u.user_metadata?.full_name,
                profile_picture_url: publicUser.profile_picture_url || u.user_metadata?.avatar_url || u.user_metadata?.profile_picture_url,
                id: publicUser.id || u.id, 
                auth_id: u.id 
              });
            } else if (publicUser?._missing) {
              console.warn('User record genuinely missing in public.users. Signing out:', u.email);
              await supabase.auth.signOut();
              setUser(null);
            } else {
              console.log('Session restored with degraded profile data due to fetch error:', u.email);
              setUser({ ...u, ...u.user_metadata, id: u.id, auth_id: u.id, full_name: u.user_metadata?.full_name });
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
                if (publicUser && !publicUser._missing) {
                  setUser({ 
                    ...u, 
                    ...u.user_metadata, 
                    ...publicUser, 
                    full_name: publicUser.name || u.user_metadata?.full_name,
                    profile_picture_url: publicUser.profile_picture_url || u.user_metadata?.avatar_url || u.user_metadata?.profile_picture_url,
                    id: publicUser.id || u.id, 
                    auth_id: u.id 
                  });
                } else if (publicUser?._missing) {
                  console.warn('User record genuinely missing in public.users. Signing out:', u.email);
                  await supabase.auth.signOut();
                  setUser(null);
                } else {
                  setUser({ ...u, ...u.user_metadata, id: u.id, auth_id: u.id, full_name: u.user_metadata?.full_name });
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
