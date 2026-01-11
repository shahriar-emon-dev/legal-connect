import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import Sidebar from '../../components/Sidebar/Sidebar';
import Card from '../../components/Card/Card';
import Button from '../../components/Button/Button';
import styles from './ClientCommunicationPortal.module.css';

const ClientCommunicationPortal = () => {
  const { clientId } = useParams();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('chats');
  const [chats, setChats] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [selectedChat, setSelectedChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const token = localStorage.getItem('token');
      const [chatsRes, documentsRes] = await Promise.all([
        axios.get('/api/lawyer/chats', {
          headers: { 'Authorization': `Bearer ${token}` }
        }),
        axios.get('/api/lawyer/documents', {
          headers: { 'Authorization': `Bearer ${token}` }
        })
      ]);
      setChats(chatsRes.data);
      setDocuments(documentsRes.data);
    } catch (error) {
      console.error('Error fetching data:', error);
      // Sample data
      setChats([
        {
          id: 1,
          clientName: 'Jane Doe',
          lastMessage: 'Please review the contract',
          time: '2 hours ago',
          unread: 2
        },
        {
          id: 2,
          clientName: 'Bob Smith',
          lastMessage: 'Thank you for the advice',
          time: '1 day ago',
          unread: 0
        }
      ]);
      setDocuments([
        {
          id: 1,
          clientName: 'Jane Doe',
          name: 'Contract_Review.pdf',
          uploadedAt: '2024-01-10',
          size: '2.5 MB'
        },
        {
          id: 2,
          clientName: 'Bob Smith',
          name: 'Case_Documents.zip',
          uploadedAt: '2024-01-09',
          size: '15 MB'
        }
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleChatSelect = async (chat) => {
    setSelectedChat(chat);
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`/api/lawyer/chats/${chat.id}/messages`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      setMessages(response.data);
    } catch (error) {
      console.error('Error fetching messages:', error);
      // Sample messages
      setMessages([
        { id: 1, sender: 'client', message: 'Hello, I need help with my case.', time: '2024-01-10 10:00' },
        { id: 2, sender: 'lawyer', message: 'Sure, can you provide more details?', time: '2024-01-10 10:05' },
        { id: 3, sender: 'client', message: 'Please review the contract attached.', time: '2024-01-10 10:10' }
      ]);
    }
  };

  const handleSendMessage = async () => {
    if (!newMessage.trim()) return;
    try {
      const token = localStorage.getItem('token');
      await axios.post(`/api/lawyer/chats/${selectedChat.id}/messages`, {
        message: newMessage
      }, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      setMessages([...messages, {
        id: Date.now(),
        sender: 'lawyer',
        message: newMessage,
        time: new Date().toISOString()
      }]);
      setNewMessage('');
    } catch (error) {
      console.error('Error sending message:', error);
    }
  };

  const handleViewDocument = (doc) => {
    // Open document in new tab or modal
    window.open(`/api/documents/${doc.id}`, '_blank');
  };

  if (loading) {
    return <div className={styles.loading}>Loading communication portal...</div>;
  }

  return (
    <div className={styles.portal}>
      <div className={styles.portalLayout}>
        <Sidebar userType="lawyer" />
        <div className={styles.portalContent}>
          <div className={styles.portalHeader}>
            <h1 className={styles.portalTitle}>Client Communication Portal</h1>
            <div className={styles.tabButtons}>
              <Button
                variant={activeTab === 'chats' ? 'primary' : 'outline'}
                onClick={() => setActiveTab('chats')}
              >
                Chats
              </Button>
              <Button
                variant={activeTab === 'documents' ? 'primary' : 'outline'}
                onClick={() => setActiveTab('documents')}
              >
                Documents
              </Button>
            </div>
          </div>

          {activeTab === 'chats' && (
            <div className={styles.chatsSection}>
              <div className={styles.chatsList}>
                <Card>
                  <h2>Active Chats</h2>
                  {chats.length === 0 ? (
                    <p className={styles.emptyState}>No active chats.</p>
                  ) : (
                    <div className={styles.chatItems}>
                      {chats.map(chat => (
                        <div
                          key={chat.id}
                          className={`${styles.chatItem} ${selectedChat?.id === chat.id ? styles.active : ''}`}
                          onClick={() => handleChatSelect(chat)}
                        >
                          <div className={styles.chatInfo}>
                            <h3>{chat.clientName}</h3>
                            <p>{chat.lastMessage}</p>
                            <span className={styles.chatTime}>{chat.time}</span>
                          </div>
                          {chat.unread > 0 && (
                            <span className={styles.unreadBadge}>{chat.unread}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              </div>
              <div className={styles.chatWindow}>
                {selectedChat ? (
                  <Card>
                    <h2>Chat with {selectedChat.clientName}</h2>
                    <div className={styles.messagesContainer}>
                      {messages.map(msg => (
                        <div
                          key={msg.id}
                          className={`${styles.message} ${msg.sender === 'lawyer' ? styles.sent : styles.received}`}
                        >
                          <p>{msg.message}</p>
                          <span className={styles.messageTime}>
                            {new Date(msg.time).toLocaleTimeString()}
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className={styles.messageInput}>
                      <input
                        type="text"
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        placeholder="Type your message..."
                        onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                      />
                      <Button onClick={handleSendMessage}>Send</Button>
                    </div>
                  </Card>
                ) : (
                  <Card>
                    <p className={styles.emptyState}>Select a chat to start communicating.</p>
                  </Card>
                )}
              </div>
            </div>
          )}

          {activeTab === 'documents' && (
            <section className={styles.section}>
              <Card>
                <h2>Client Documents</h2>
                {documents.length === 0 ? (
                  <p className={styles.emptyState}>No documents received.</p>
                ) : (
                  <div className={styles.documentsList}>
                    {documents.map(doc => (
                      <div key={doc.id} className={styles.documentItem}>
                        <div className={styles.documentInfo}>
                          <span className={styles.documentIcon}>📄</span>
                          <div>
                            <p className={styles.documentName}>{doc.name}</p>
                            <p className={styles.documentMeta}>
                              From: {doc.clientName} • {new Date(doc.uploadedAt).toLocaleDateString()} • {doc.size}
                            </p>
                          </div>
                        </div>
                        <Button variant="outline" onClick={() => handleViewDocument(doc)}>
                          View
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </section>
          )}
        </div>
      </div>
    </div>
  );
};

export default ClientCommunicationPortal;