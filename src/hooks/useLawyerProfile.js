import { useState, useEffect } from 'react';
import { supabase } from '../services/supabase';
import { useAuth } from '../context/AuthContext';
import { realtimeSync } from '../services/realtimeSync.service';

export function useLawyerProfile() {
  const { user } = useAuth();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!user) return;

    const fetchProfile = async () => {
      try {
        setLoading(true);
        const { data, error } = await supabase
          .from('lawyers')
          .select('*, users(name)')
          .eq('user_id', user.auth_id || user.id)
          .single();

        if (error && error.code !== 'PGRST116') throw error;
        
        let mappedData = null;
        if (data) {
          mappedData = {
            ...data,
            full_name: data.users?.name || user.name,
            years_experience: data.experience_years,
            primary_location: data.location,
            contact_email: data.contact_email || user.email,
            contact_phone: data.contact_phone || user.phone,
          };
        }
        setProfile(mappedData);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();

    const unsub = realtimeSync.subscribe((payload) => {
      // Audit #36: this used to also refetch on ANY event missing a userId,
      // or on any APPROVED/REJECTED action for ANY lawyer — triggering
      // unnecessary refetches from unrelated users' approval events.
      const uId = user.auth_id || user.id;
      if (payload.userId === uId) {
        fetchProfile();
      }
    });

    return () => unsub();
  }, [user]);

  const updateProfile = async (updates) => {
    if (!user) return;
    try {
      const dbUpdates = { ...updates };
      // Map frontend fields to DB fields
      if (dbUpdates.years_experience !== undefined) {
        dbUpdates.experience_years = dbUpdates.years_experience;
        delete dbUpdates.years_experience;
      }
      if (dbUpdates.primary_location !== undefined) {
        dbUpdates.location = dbUpdates.primary_location;
        delete dbUpdates.primary_location;
      }
      delete dbUpdates.full_name; // Saved separately in LawyerBasicInfoView

      const { error } = await Promise.race([
        supabase
          .from('lawyers')
          .upsert({ user_id: user.auth_id || user.id, ...dbUpdates, updated_at: new Date().toISOString() }, { onConflict: 'user_id' }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Request timed out. Please check your internet connection or reload the page.')), 10000))
      ]);
      if (error) throw error;
      setProfile(prev => ({ ...prev, ...updates }));
    } catch (err) {
      console.error('Failed to update profile:', err);
      throw err;
    }
  };

  return { profile, loading, error, updateProfile };
}
