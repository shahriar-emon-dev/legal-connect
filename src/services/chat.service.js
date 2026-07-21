import { supabase } from './supabase';

/**
 * Verify the current user is a participant in the contract that owns this workspace.
 * Returns { allowed: boolean, contractId: number | null }
 *
 * Audit #38 recommended removing this as redundant with RLS. It is NOT
 * redundant: the messages RLS policy's WITH CHECK matches workspace-based
 * inserts only via `is_owner(sender_id)` (conversation_id is NULL on this
 * code path), so without this check any authenticated user could insert into
 * any workspace_id by setting sender_id to their own id. See the fix + full
 * writeup in sql/67_p2_medium_priority_hardening.sql. Keep this check.
 */
async function verifyParticipant(workspaceId, userId) {
  if (!workspaceId || !userId) return { allowed: false, contractId: null };
  const { data, error } = await supabase
    .from('contracts')
    .select('id, client_id, lawyer_id')
    .eq('workspace_id', workspaceId)
    .single();
  if (error || !data) return { allowed: false, contractId: null };
  const allowed = data.client_id === userId || data.lawyer_id === userId;
  return { allowed, contractId: data.id };
}

/**
 * Fetch chat history for a workspace, with pagination.
 * @param {string} workspaceId - UUID of the workspace
 * @param {object} options - { from, to } for pagination via .range()
 * @returns {Array} messages
 */
export async function fetchChatHistory(workspaceId, { from = 0, to = 49 } = {}) {
  try {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: true })
      .range(from, to);
    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('fetchChatHistory error:', error);
    return [];
  }
}

/**
 * Send a message to a workspace after verifying the user is a participant.
 * @returns {object|null} the inserted message row, or null on failure
 */
export async function sendMessage({ workspaceId, content, senderName, senderRole, senderId }) {
  try {
    // Participant verification: check contracts table
    const { allowed } = await verifyParticipant(workspaceId, senderId);
    if (!allowed) {
      console.error('sendMessage: user is not a participant in this workspace');
      return null;
    }

    const { data, error } = await supabase
      .from('messages')
      .insert([{
        workspace_id: workspaceId,
        sender_id: senderId,
        sender_name: senderName,
        sender_role: senderRole,
        content,
        is_read: false,
      }])
      .select()
      .single();
    if (error) throw error;
    return data;
  } catch (error) {
    console.error('sendMessage error:', error);
    return null;
  }
}

/**
 * Mark all messages in a workspace as read (except the current user's own messages).
 * @returns {Array} updated messages
 */
export async function markMessagesRead(workspaceId, currentUserId) {
  try {
    const { data, error } = await supabase
      .from('messages')
      .update({ is_read: true })
      .eq('workspace_id', workspaceId)
      .eq('is_read', false)
      .neq('sender_id', currentUserId)
      .select();
    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('markMessagesRead error:', error);
    return [];
  }
}

/**
 * Subscribe to new messages in a workspace via Supabase Realtime.
 * @returns {RealtimeChannel} — call unsubscribeFromMessages() to clean up
 */
export function subscribeToMessages(workspaceId, onNewMessage) {
  const channel = supabase
    .channel('messages-' + workspaceId)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `workspace_id=eq.${workspaceId}`
      },
      (payload) => {
        if (payload.new) {
          onNewMessage(payload.new);
        }
      }
    )
    .subscribe();

  return channel;
}

/**
 * Unsubscribe from a Supabase Realtime channel.
 */
export async function unsubscribeFromMessages(channel) {
  if (channel) {
    await supabase.removeChannel(channel);
  }
}
