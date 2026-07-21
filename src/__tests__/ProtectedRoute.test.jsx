import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ProtectedRoute from '../components/ProtectedRoute/ProtectedRoute';
import { AuthContext } from '../context/AuthContext';

// Mock Supabase so no real network calls are made
jest.mock('../services/supabase', () => ({
  supabase: {
    auth: {
      getSession: jest.fn().mockResolvedValue({ data: { session: null }, error: null }),
      onAuthStateChange: jest.fn().mockReturnValue({ data: { subscription: { unsubscribe: jest.fn() } } }),
    },
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
    }),
    channel: jest.fn().mockReturnValue({
      on: jest.fn().mockReturnThis(),
      subscribe: jest.fn().mockReturnThis(),
    }),
    removeChannel: jest.fn(),
  },
}));

// Mock realtimeSync so AuthContext doesn't try to open a real channel
jest.mock('../services/realtimeSync.service', () => ({
  realtimeSync: {
    subscribe: jest.fn().mockReturnValue(() => {}),
  },
}));

/**
 * Helper: renders ProtectedRoute inside a MemoryRouter with a given auth state.
 */
const renderWithAuth = (authValue) =>
  render(
    <AuthContext.Provider value={authValue}>
      <MemoryRouter initialEntries={['/protected']}>
        <Routes>
          <Route
            path="/protected"
            element={
              <ProtectedRoute>
                <div>Protected Content</div>
              </ProtectedRoute>
            }
          />
          <Route path="/login" element={<div>Login Page Redirected</div>} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>
  );

describe('ProtectedRoute', () => {
  it('renders children when user is authenticated', async () => {
    renderWithAuth({
      user: { id: 1, email: 'test@test.com', user_type: 'client' },
      loading: false,
      isAuthenticated: true,
    });

    await waitFor(() => {
      expect(screen.getByText('Protected Content')).toBeInTheDocument();
    });
  });

  it('redirects to /login when user is not authenticated', async () => {
    renderWithAuth({
      user: null,
      loading: false,
      isAuthenticated: false,
    });

    await waitFor(() => {
      expect(screen.getByText('Login Page Redirected')).toBeInTheDocument();
    });
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  });

  it('shows a loading state instead of redirecting while auth is resolving', () => {
    renderWithAuth({
      user: null,
      loading: true,
      isAuthenticated: false,
    });

    expect(screen.queryByText('Login Page Redirected')).not.toBeInTheDocument();
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  });
});

describe('ProtectedRoute with role restrictions', () => {
  const renderWithRoles = (authValue, roles) =>
    render(
      <AuthContext.Provider value={authValue}>
        <MemoryRouter initialEntries={['/protected']}>
          <Routes>
            <Route
              path="/protected"
              element={
                <ProtectedRoute roles={roles}>
                  <div>Protected Content</div>
                </ProtectedRoute>
              }
            />
            <Route path="/" element={<div>Home Redirected</div>} />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>
    );

  it('renders children when the user role is in the allowed list', async () => {
    renderWithRoles(
      { user: { id: 1, user_type: 'lawyer' }, loading: false, isAuthenticated: true },
      ['lawyer']
    );

    await waitFor(() => {
      expect(screen.getByText('Protected Content')).toBeInTheDocument();
    });
  });

  it('redirects to home when the user role is not in the allowed list', async () => {
    renderWithRoles(
      { user: { id: 1, user_type: 'client' }, loading: false, isAuthenticated: true },
      ['lawyer']
    );

    await waitFor(() => {
      expect(screen.getByText('Home Redirected')).toBeInTheDocument();
    });
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  });
});
