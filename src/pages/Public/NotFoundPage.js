import React from 'react';
import { Link, useLocation } from 'react-router-dom';

const NotFoundPage = () => {
  const location = useLocation();

  return (
    <main className="min-h-[70vh] flex flex-col items-center justify-center text-center px-6 py-24">
      <span className="material-symbols-outlined text-6xl text-gray-300 mb-4">search_off</span>
      <h1 className="text-5xl font-serif font-bold text-navy-primary mb-3">404</h1>
      <p className="text-lg text-gray-600 mb-1">We couldn't find the page you're looking for.</p>
      <p className="text-sm text-gray-400 mb-8 font-mono break-all max-w-md">{location.pathname}</p>
      <div className="flex gap-3">
        <Link
          to="/"
          className="px-6 py-3 bg-navy-primary text-white font-bold rounded-lg hover:bg-navy-primary/90 transition-colors"
        >
          Back to Home
        </Link>
        <Link
          to="/lawyers"
          className="px-6 py-3 border border-navy-primary text-navy-primary font-bold rounded-lg hover:bg-gray-50 transition-colors"
        >
          Find a Lawyer
        </Link>
      </div>
    </main>
  );
};

export default NotFoundPage;
