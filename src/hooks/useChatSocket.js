/**
 * useRealtimeChat (formerly useChatSocket)
 * 100% Supabase Realtime messaging & typing broadcast hook.
 * Reuses subscribed channel reference to prevent channel memory leaks.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../services/supabase';
import { useAuth } from '../context/AuthContext';

export default function useRealtimeChat(workspaceId) {
  const { user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [typingUser, setTypingUser] = useState(null);

  const typingTimerRef = useRef(null);
  const channelRef = useRef(null);

  // Load history via REST
  useEffect(() => {
    if (!workspaceId) { setIsLoading(false); return; }

    setIsLoading(true);
    setError(null);

    const loadMessages = async () => {
      try {
        const { data, error: fetchErr } = await supabase.from('messages')
          .select('*')
          .eq('workspace_id', workspaceId)
          .order('created_at', { ascending: true });
        
        if (fetchErr) throw fetchErr;
        setMessages(data || []);
      } catch (err) {
        setError(err.message || 'Failed to load messages');
      } finally {
        setIsLoading(false);
      }
    };
    
    loadMessages();
  }, [workspaceId]);

  // Realtime listeners
  useEffect(() => {
    if (!workspaceId) return;

    const channel = supabase.channel(`chat_${workspaceId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `workspace_id=eq.${workspaceId}` }, (payload) => {
        setMessages((prev) => {
          if (prev.find(m => m.id === payload.new.id)) return prev;
          playPing();
          return [...prev, payload.new];
        });
      })
      .on('broadcast', { event: 'typing' }, (payload) => {
        if (payload.payload.user_id !== user?.id) {
          setTypingUser(payload.payload.is_typing ? payload.payload.user_name : null);
          if (payload.payload.is_typing) {
            clearTimeout(typingTimerRef.current);
            typingTimerRef.current = setTimeout(() => setTypingUser(null), 3000);
          }
        }
      })
      .subscribe();

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      clearTimeout(typingTimerRef.current);
    };
  }, [workspaceId, user?.id]);

  const sendMessage = useCallback(async (content) => {
    if (!content.trim() || !workspaceId || !user) return { success: false };
    
    const payload = {
      workspace_id: workspaceId,
      sender_id: user.id,
      sender_name: user.name || 'User',
      sender_role: user.user_type || 'client',
      content,
      is_read: false
    };

    const { data, error: insertErr } = await supabase.from('messages').insert([payload]).select().single();
    if (!insertErr && data) {
      setMessages((prev) => {
        if (prev.find(m => m.id === data.id)) return prev;
        return [...prev, data];
      });
      return { success: true, message: data };
    }
    return { success: false };
  }, [workspaceId, user]);

  const emitTyping = useCallback((is_typing) => {
    if (!channelRef.current || !user) return;
    channelRef.current.send({
      type: 'broadcast',
      event: 'typing',
      payload: { is_typing, user_id: user.id, user_name: user.name },
    });
  }, [user]);

  const markRead = useCallback(async () => {
    if (!workspaceId || !user) return;
    await supabase.from('messages').update({ is_read: true }).eq('workspace_id', workspaceId).neq('sender_id', user.id);
  }, [workspaceId, user]);

  return { messages, isLoading, error, typingUser, sendMessage, emitTyping, markRead };
}

export { useRealtimeChat as useChatSocket };

function playPing() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 520;
    gain.gain.setValueAtTime(0.1, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.4);
  } catch {}
}
