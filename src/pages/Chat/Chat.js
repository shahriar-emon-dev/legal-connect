import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import Button from '../../components/Button/Button';
import styles from './Chat.module.css';

const Chat = () => {
  const { userId } = useParams();
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [chatUsers, setChatUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(userId || null);
  const [loading, setLoading] = useState(true);
  const messagesEndRef = useRef(null);
  const wsRef = useRef(null);

  const fetchChatData = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      
      // Fetch chat users (lawyers for clients, clients for lawyers)
      const usersRes = await axios.get(`/api/chat/users`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      setChatUsers(usersRes.data);

      if (selectedUser) {
        await fetchMessages(selectedUser);
      }
    } catch (error) {
      console.error('Error fetching chat data:', error);
      // Sample data
      const sampleUsers = [
        { id: 1, name: 'John Smith', type: 'lawyer', lastMessage: 'Thank you for the document.' },
        { id: 2, name: 'Sarah Johnson', type: 'lawyer', lastMessage: 'See you at the appointment.' }
      ];
      setChatUsers(sampleUsers);
      
      if (selectedUser) {
        const sampleMessages = [
          {
            id: 1,
            senderId: selectedUser,
            senderName: 'John Smith',
            message: 'Hello, how can I help you?',
            timestamp: new Date(Date.now() - 3600000).toISOString()
          },
          {
            id: 2,
            senderId: 'current',
            senderName: 'You',
            message: 'I have a question about my case.',
            timestamp: new Date(Date.now() - 1800000).toISOString()
          },
          {
            id: 3,
            senderId: selectedUser,
            senderName: 'John Smith',
            message: 'Sure, what would you like to know?',
            timestamp: new Date(Date.now() - 900000).toISOString()
          }
        ];
        setMessages(sampleMessages);
      }
    } finally {
      setLoading(false);
    }
  }, [selectedUser]);

  useEffect(() => {
    fetchChatData();
    // In a real app, you would set up WebSocket connection here
    // For now, we'll simulate with polling
    const interval = setInterval(() => {
      if (selectedUser) {
        fetchMessages(selectedUser);
      }
    }, 2000);

    const ws = wsRef.current;
    return () => {
      clearInterval(interval);
      if (ws) {
        ws.close();
      }
    };
  }, [fetchChatData, selectedUser]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const fetchMessages = async (targetUserId) => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`/api/chat/messages/${targetUserId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      setMessages(response.data);
    } catch (error) {
      console.error('Error fetching messages:', error);
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    
    if (!newMessage.trim() || !selectedUser) {
      return;
    }

    const messageData = {
      receiverId: selectedUser,
      message: newMessage.trim()
    };

    // Optimistically add message
    const tempMessage = {
      id: Date.now(),
      senderId: 'current',
      senderName: 'You',
      message: newMessage.trim(),
      timestamp: new Date().toISOString()
    };
    setMessages(prev => [...prev, tempMessage]);
    setNewMessage('');

    try {
      const token = localStorage.getItem('token');
      await axios.post('/api/chat/send', messageData, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      // In a real app, the message would be added via WebSocket
    } catch (error) {
      console.error('Error sending message:', error);
      // Remove optimistic message on error
      setMessages(prev => prev.filter(msg => msg.id !== tempMessage.id));
      setNewMessage(messageData.message);
    }
  };

  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    const minutes = Math.floor(diff / 60000);
    
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`;
    return date.toLocaleDateString();
  };

  const selectedUserData = chatUsers.find(u => u.id === parseInt(selectedUser));

  if (loading) {
    return <div className={styles.loading}>Loading chat...</div>;
  }

  return (
    <div className={styles.chat}>
      <div className={styles.chatContainer}>
        {/* Chat Users List */}
        <div className={styles.chatUsers}>
          <h3 className={styles.chatUsersTitle}>Messages</h3>
          {chatUsers.length === 0 ? (
            <p className={styles.noUsers}>No conversations yet</p>
          ) : (
            <div className={styles.usersList}>
              {chatUsers.map(user => (
                <div
                  key={user.id}
                  className={`${styles.userItem} ${selectedUser === user.id.toString() ? styles.active : ''}`}
                  onClick={() => setSelectedUser(user.id.toString())}
                >
                  <div className={styles.userAvatar}>
                    {user.name.charAt(0).toUpperCase()}
                  </div>
                  <div className={styles.userInfo}>
                    <p className={styles.userName}>{user.name}</p>
                    <p className={styles.lastMessage}>{user.lastMessage || 'No messages yet'}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Chat Messages */}
        <div className={styles.chatMessages}>
          {!selectedUser ? (
            <div className={styles.noSelection}>
              <p>Select a conversation to start chatting</p>
            </div>
          ) : (
            <>
              <div className={styles.chatHeader}>
                <div className={styles.chatHeaderUser}>
                  <div className={styles.chatAvatar}>
                    {selectedUserData?.name.charAt(0).toUpperCase() || 'U'}
                  </div>
                  <div>
                    <h3>{selectedUserData?.name || 'User'}</h3>
                    <p className={styles.userType}>{selectedUserData?.type || 'lawyer'}</p>
                  </div>
                </div>
              </div>

              <div className={styles.messagesContainer}>
                {messages.length === 0 ? (
                  <div className={styles.noMessages}>
                    <p>No messages yet. Start the conversation!</p>
                  </div>
                ) : (
                  messages.map(message => {
                    const isOwn = message.senderId === 'current' || 
                                 message.senderId === localStorage.getItem('userId');
                    return (
                      <div
                        key={message.id}
                        className={`${styles.message} ${isOwn ? styles.ownMessage : ''}`}
                      >
                        <div className={styles.messageContent}>
                          <p>{message.message}</p>
                          <span className={styles.messageTime}>
                            {formatTime(message.timestamp)}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              <form onSubmit={handleSendMessage} className={styles.messageForm}>
                <input
                  type="text"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Type a message..."
                  className={styles.messageInput}
                />
                <Button type="submit" variant="primary" disabled={!newMessage.trim()}>
                  Send
                </Button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default Chat;


