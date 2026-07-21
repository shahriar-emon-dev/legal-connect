import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../services/supabase';
import { useAuth } from '../../context/AuthContext';

const GlobalSearchModal = ({ isOpen, onClose }) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const inputRef = useRef(null);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState({ lawyers: [], jobs: [], cases: [], contracts: [] });
  const [loading, setLoading] = useState(false);
  const [recentSearches, setRecentSearches] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [activeCategory, setActiveCategory] = useState('All'); // 'All' | 'Lawyers' | 'Jobs' | 'Cases'

  // Load recent searches from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('legalconnect_recent_searches');
      if (saved) setRecentSearches(JSON.parse(saved));
    } catch (err) {
      console.warn('Could not load recent searches:', err);
    }
  }, []);

  // Focus input when modal opens
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Debounced search logic
  const executeSearch = useCallback(async (searchQuery) => {
    if (!searchQuery || searchQuery.trim().length < 2) {
      setResults({ lawyers: [], jobs: [], cases: [], contracts: [] });
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('global_search', {
        p_query: searchQuery.trim(),
        p_user_id: user?.id || null,
        p_role: user?.user_type || 'client',
        p_limit: 8
      });

      if (!error && data) {
        setResults({
          lawyers: data.lawyers || [],
          jobs: data.jobs || [],
          cases: data.cases || [],
          contracts: data.contracts || []
        });
      } else {
        // Fallback if RPC is not applied yet
        const [lawyersRes, jobsRes] = await Promise.all([
          supabase.from('lawyers').select('id, specialization, location, rating').eq('is_verified', true).ilike('specialization', `%${searchQuery.trim()}%`).limit(6),
          supabase.from('jobs').select('id, title, category, budget_max').eq('status', 'open').ilike('title', `%${searchQuery.trim()}%`).limit(6)
        ]);

        setResults({
          lawyers: (lawyersRes.data || []).map(l => ({
            id: l.id,
            title: l.specialization || 'Advocate',
            subtitle: l.location || 'Bangladesh',
            link: `/lawyers/${l.id}`,
            type: 'lawyer',
            rating: l.rating
          })),
          jobs: (jobsRes.data || []).map(j => ({
            id: j.id,
            title: j.title,
            subtitle: `Category: ${j.category || 'General'} • Budget: BDT ${j.budget_max || 'Negotiable'}`,
            link: `/jobs/${j.id}`,
            type: 'job'
          })),
          cases: [],
          contracts: []
        });
      }
    } catch (err) {
      console.error('Global search error:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Debounce trigger
  useEffect(() => {
    const timer = setTimeout(() => {
      if (query.trim().length >= 2) {
        executeSearch(query);
      } else {
        setResults({ lawyers: [], jobs: [], cases: [], contracts: [] });
      }
    }, 280);
    return () => clearTimeout(timer);
  }, [query, executeSearch]);

  // Flatten results for keyboard navigation
  const flatResults = React.useMemo(() => {
    let list = [];
    if (activeCategory === 'All' || activeCategory === 'Lawyers') list.push(...(results.lawyers || []));
    if (activeCategory === 'All' || activeCategory === 'Jobs') list.push(...(results.jobs || []));
    if (activeCategory === 'All' || activeCategory === 'Cases') list.push(...(results.cases || []));
    if (activeCategory === 'All' || activeCategory === 'Contracts') list.push(...(results.contracts || []));
    return list;
  }, [results, activeCategory]);

  // Save to recent searches
  const saveRecentSearch = React.useCallback((item) => {
    try {
      setRecentSearches(prev => {
        const updated = [item, ...prev.filter(r => r.link !== item.link)].slice(0, 6);
        localStorage.setItem('legalconnect_recent_searches', JSON.stringify(updated));
        return updated;
      });
    } catch (err) {
      console.warn('Could not save recent search:', err);
    }
  }, []);

  const handleSelect = React.useCallback((item) => {
    saveRecentSearch(item);
    onClose();
    navigate(item.link);
  }, [saveRecentSearch, onClose, navigate]);

  const clearRecentSearches = () => {
    setRecentSearches([]);
    localStorage.removeItem('legalconnect_recent_searches');
  };

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!isOpen) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => (prev < flatResults.length - 1 ? prev + 1 : 0));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => (prev > 0 ? prev - 1 : flatResults.length - 1));
      } else if (e.key === 'Enter' && flatResults.length > 0 && flatResults[selectedIndex]) {
        e.preventDefault();
        handleSelect(flatResults[selectedIndex]);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, flatResults, selectedIndex, handleSelect, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-sm flex items-start justify-center pt-16 px-4 animate-fadeIn">
      <div
        className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full overflow-hidden border border-gray-200 transition-all flex flex-col max-h-[80vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Bar Header */}
        <div className="p-4 sm:p-6 border-b border-gray-100 flex items-center gap-3 bg-gray-50/50">
          <span className="material-symbols-outlined text-gray-400 text-2xl shrink-0">search</span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelectedIndex(0); }}
            placeholder="Search advocates, jobs, active cases, contracts... (Type 2+ characters)"
            className="w-full bg-transparent border-none text-gray-800 font-medium text-base sm:text-lg focus:outline-none placeholder:text-gray-400"
          />
          {query && (
            <button
              onClick={() => { setQuery(''); inputRef.current?.focus(); }}
              className="p-1.5 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-200/50 transition-colors shrink-0"
            >
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>
          )}
          <div className="hidden sm:flex items-center gap-1 px-2.5 py-1 bg-gray-200/60 rounded-lg text-gray-500 text-xs font-bold uppercase tracking-wider shrink-0 select-none">
            ESC
          </div>
        </div>

        {/* Category Filter Pills */}
        <div className="px-4 sm:px-6 py-3 bg-gray-50 border-b border-gray-100 flex items-center gap-2 overflow-x-auto no-scrollbar">
          {['All', 'Lawyers', 'Jobs', 'Cases', 'Contracts'].map((cat) => (
            <button
              key={cat}
              onClick={() => { setActiveCategory(cat); setSelectedIndex(0); }}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                activeCategory === cat
                  ? 'bg-[#041635] text-white shadow-sm'
                  : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-100'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Results / History Container */}
        <div className="overflow-y-auto p-4 sm:p-6 space-y-6 flex-1 divide-y divide-gray-100">
          {loading && (
            <div className="py-12 text-center text-gray-500 flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-3 border-[#1E6B4A] border-t-transparent rounded-full animate-spin" />
              <span className="text-sm font-medium">Searching legal directory & records...</span>
            </div>
          )}

          {!loading && query.trim().length >= 2 && flatResults.length === 0 && (
            <div className="py-12 text-center text-gray-500">
              <span className="material-symbols-outlined text-4xl text-gray-300 mb-2">search_off</span>
              <p className="text-base font-bold text-gray-700">No results found for "{query}"</p>
              <p className="text-xs text-gray-400 mt-1">Try a different keyword, practice area, or check for typos.</p>
            </div>
          )}

          {/* Render Active Search Results */}
          {!loading && flatResults.length > 0 && (
            <div className="space-y-1">
              <div className="text-xs font-bold text-gray-400 uppercase tracking-wider px-3 pb-2">
                Search Results ({flatResults.length})
              </div>
              {flatResults.map((item, idx) => {
                const isSelected = selectedIndex === idx;
                return (
                  <button
                    key={`${item.type}-${item.id}`}
                    onClick={() => handleSelect(item)}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    className={`w-full p-3.5 rounded-2xl flex items-center justify-between gap-4 text-left transition-all ${
                      isSelected ? 'bg-[#1E6B4A]/10 border border-[#1E6B4A]/30 shadow-2xs' : 'hover:bg-gray-50 border border-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                        item.type === 'lawyer' ? 'bg-amber-400/20 text-[#041635]' :
                        item.type === 'job' ? 'bg-blue-500/10 text-blue-600' :
                        item.type === 'case' ? 'bg-purple-500/10 text-purple-600' : 'bg-green-500/10 text-green-600'
                      }`}>
                        <span className="material-symbols-outlined text-[22px]">
                          {item.type === 'lawyer' ? 'gavel' : item.type === 'job' ? 'work' : item.type === 'case' ? 'folder_special' : 'description'}
                        </span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-bold text-sm text-[#041635] truncate flex items-center gap-2">
                          <span>{item.title}</span>
                          {item.type === 'lawyer' && <span className="material-symbols-outlined text-green-600 text-[15px]">verified</span>}
                        </div>
                        <div className="text-xs text-gray-500 truncate mt-0.5">{item.subtitle}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="px-2.5 py-1 rounded-lg bg-gray-100 text-gray-600 font-bold text-[10px] uppercase">
                        {item.type}
                      </span>
                      <span className="material-symbols-outlined text-gray-400 text-[18px]">chevron_right</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Render Recent Searches if query is empty */}
          {!query && recentSearches.length > 0 && (
            <div className="space-y-2 pt-2">
              <div className="flex items-center justify-between px-3 pb-1">
                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Recent Searches</span>
                <button
                  onClick={clearRecentSearches}
                  className="text-xs font-bold text-red-500 hover:text-red-700 transition-colors"
                >
                  Clear all
                </button>
              </div>
              {recentSearches.map((item, idx) => (
                <button
                  key={`recent-${idx}`}
                  onClick={() => handleSelect(item)}
                  className="w-full p-3 rounded-2xl flex items-center justify-between gap-3 text-left hover:bg-gray-50 transition-colors border border-transparent"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="material-symbols-outlined text-gray-400 text-[20px] shrink-0">history</span>
                    <div className="min-w-0">
                      <div className="font-bold text-sm text-gray-700 truncate">{item.title}</div>
                      <div className="text-[11px] text-gray-400 truncate">{item.subtitle}</div>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-500 text-[10px] font-bold uppercase shrink-0">
                    {item.type}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Modal Footer Controls */}
        <div className="p-4 bg-gray-50 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-white border border-gray-200 rounded font-bold text-[10px] shadow-2xs">↑</kbd>
              <kbd className="px-1.5 py-0.5 bg-white border border-gray-200 rounded font-bold text-[10px] shadow-2xs">↓</kbd>
              to navigate
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-white border border-gray-200 rounded font-bold text-[10px] shadow-2xs">↵</kbd>
              to select
            </span>
          </div>
          <button
            onClick={onClose}
            className="font-bold text-[#041635] hover:underline"
          >
            Close Search
          </button>
        </div>
      </div>
    </div>
  );
};

export default GlobalSearchModal;
