import React, { useState, useEffect } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { supabase } from '../../services/supabase';

const LawyerSearch = () => {
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const initialDept = searchParams.get('department') || '';

  const [lawyers, setLawyers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);
  const [totalCount, setTotalCount] = useState(0);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDepts, setSelectedDepts] = useState(initialDept ? [initialDept] : []);
  const [locationQuery, setLocationQuery] = useState('');
  const [maxRate, setMaxRate] = useState(10000);
  
  const [sortOption, setSortOption] = useState('Top Rated');
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 9;

  const [practiceAreas, setPracticeAreas] = useState([]);
  const [legalExpertise, setLegalExpertise] = useState([]);

  useEffect(() => {
    fetchDynamicCategories();
  }, []);

  useEffect(() => {
    fetchLawyers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, selectedDepts, locationQuery, maxRate, sortOption, currentPage]);

  const fetchDynamicCategories = async () => {
    try {
      const [areasRes, expRes] = await Promise.all([
        supabase.from('practice_areas').select('*').order('name'),
        supabase.from('legal_expertise').select('*').order('name')
      ]);
      if (areasRes.data) setPracticeAreas(areasRes.data);
      if (expRes.data) setLegalExpertise(expRes.data);
    } catch (err) {
      console.error('Error fetching dynamic categories:', err);
    }
  };

  const fetchLawyers = async () => {
    setLoading(true);
    try {
      let data = null, error = null;
      
      // 1. Try server-side full-text search procedure first (Phase 12 RPC)
      try {
        const { data: rpcData, error: rpcErr } = await supabase.rpc('search_lawyers', {
          p_query: searchQuery || null,
          p_category: selectedDepts.length > 0 ? selectedDepts[0] : null,
          p_location: locationQuery || null,
          p_max_rate: maxRate,
          p_verified_only: true,
          p_limit: 100,
          p_offset: 0
        });

        if (!rpcErr && rpcData && rpcData.length > 0) {
          data = rpcData.map(item => ({
            ...item,
            user: { name: item.name, profile_picture_url: item.profile_picture_url }
          }));
        }
      } catch (e) {}

      // 2. Try with relational join if RPC returned no rows or errored
      if (!data) {
        try {
          let query = supabase
            .from('lawyers')
            .select('*, user:users(name, profile_picture_url)', { count: 'exact' })
            .eq('is_verified', true)
            .lte('hourly_rate', maxRate);

          if (locationQuery) {
            query = query.ilike('location', `%${locationQuery}%`);
          }

          const result = await query;
          data = result.data;
          error = result.error;
        } catch (e) {}
      }

      // If join failed, fallback to independent queries
      if (error || !data) {
        let query = supabase
          .from('lawyers')
          .select('*', { count: 'exact' })
          .eq('is_verified', true)
          .lte('hourly_rate', maxRate);

        if (locationQuery) {
          query = query.ilike('location', `%${locationQuery}%`);
        }

        const result = await query;
        if (result.error) throw result.error;
        data = result.data || [];

        // Enrich with user data independently
        const userIds = [...new Set(data.map(l => l.user_id).filter(Boolean))];
        if (userIds.length > 0) {
          let usersData = [];
          try { const r = await supabase.from('users').select('id, name, profile_picture_url').in('id', userIds); usersData = r.data || []; } catch (e) {}
          const userMap = {};
          usersData.forEach(u => { userMap[u.id] = u; });
          data = data.map(l => ({ ...l, user: userMap[l.user_id] || { name: 'Lawyer', profile_picture_url: null } }));
        }
      }

      // Also fetch lawyer_expertise_junction for relational matching
      const { data: junctionData } = await supabase
        .from('lawyer_expertise_junction')
        .select('*');

      let filteredData = (data || []).map(lwr => {
        const lwrId = lwr.id || lwr.user_id;
        const expertiseIds = (junctionData || [])
          .filter(j => j.lawyer_id === lwrId || j.lawyer_id === lwr.user_id)
          .map(j => j.expertise_id);
        return { ...lwr, expertiseIds };
      });

      if (searchQuery) {
        const sq = searchQuery.toLowerCase();
        filteredData = filteredData.filter(l => {
          const nameMatch = l.user?.name?.toLowerCase().includes(sq);
          const specMatch = l.specialization?.toLowerCase().includes(sq);
          const expMatch = l.expertiseIds?.some(id => {
            const expObj = legalExpertise.find(e => e.id === id);
            return expObj?.name?.toLowerCase().includes(sq);
          });
          return nameMatch || specMatch || expMatch;
        });
      }

      // Filter by selected dynamic practice areas / subcategories
      if (selectedDepts.length > 0) {
        filteredData = filteredData.filter(l => {
          // Check legacy specialization or dynamic relational expertise
          const legacyMatch = selectedDepts.some(d => l.specialization?.toLowerCase().includes(d.toLowerCase()));
          const relationalMatch = l.expertiseIds?.some(id => {
            const expObj = legalExpertise.find(e => e.id === id);
            const areaObj = practiceAreas.find(pa => pa.id === expObj?.practice_area_id);
            return selectedDepts.includes(expObj?.name) || selectedDepts.includes(areaObj?.name);
          });
          return legacyMatch || relationalMatch;
        });
      }

      // Sorting
      if (sortOption === 'Top Rated') {
        filteredData.sort((a, b) => (b.avg_rating || 0) - (a.avg_rating || 0));
      } else if (sortOption === 'Highest Price') {
        filteredData.sort((a, b) => (b.hourly_rate || 0) - (a.hourly_rate || 0));
      } else if (sortOption === 'Lowest Price') {
        filteredData.sort((a, b) => (a.hourly_rate || 0) - (b.hourly_rate || 0));
      } else if (sortOption === 'Experience') {
        filteredData.sort((a, b) => (b.experience_years || 0) - (a.experience_years || 0));
      }

      setTotalCount(filteredData.length);
      
      const from = (currentPage - 1) * itemsPerPage;
      const to = from + itemsPerPage;
      setLawyers(filteredData.slice(from, to));

    } catch (err) {
      console.error('Fetch error:', err);
      setErrorMsg(err.message || JSON.stringify(err));
    } finally {
      setLoading(false);
    }
  };

  const handleDeptToggle = (name) => {
    setSelectedDepts(prev => 
      prev.includes(name) ? prev.filter(d => d !== name) : [...prev, name]
    );
    setCurrentPage(1);
  };

  const totalPages = Math.ceil(totalCount / itemsPerPage) || 1;

  return (
    <main className="max-w-container-max mx-auto px-gutter py-lg">
      {/* Search & Filter Bar */}
      <section className="mb-lg">
        <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-md shadow-sm">
          <div className="flex flex-col md:flex-row gap-md mb-md">
            <div className="flex-1 flex items-center bg-surface-container-low px-md py-sm rounded-lg border border-transparent focus-within:border-primary focus-within:bg-surface-container-lowest transition-all group">
              <span className="material-symbols-outlined text-outline group-focus-within:text-primary mr-sm">person_search</span>
              <input 
                className="bg-transparent border-none focus:ring-0 w-full font-body-md text-on-surface-variant outline-none" 
                placeholder="Search by lawyer name or expertise..." 
                type="text"
                value={searchQuery}
                onChange={e => { setSearchQuery(e.target.value); setCurrentPage(1); }}
              />
            </div>
            <div className="flex-1 flex items-center bg-surface-container-low px-md py-sm rounded-lg border border-transparent focus-within:border-primary focus-within:bg-surface-container-lowest transition-all group">
              <span className="material-symbols-outlined text-outline group-focus-within:text-primary mr-sm">location_on</span>
              <input 
                className="bg-transparent border-none focus:ring-0 w-full font-body-md text-on-surface-variant outline-none" 
                placeholder="City or Zip Code" 
                type="text"
                value={locationQuery}
                onChange={e => { setLocationQuery(e.target.value); setCurrentPage(1); }}
              />
            </div>
            <button className="bg-primary-container text-on-primary-container h-[48px] px-xl rounded-lg font-label-md transition-all hover:brightness-110 active:scale-95 flex items-center justify-center gap-xs">
              Find Counsel
            </button>
          </div>
          <div className="flex items-center gap-sm overflow-x-auto hide-scrollbar pb-xs">
            <span className="font-label-sm text-on-secondary-container whitespace-nowrap mr-base">Quick Filters:</span>
            <button 
              className={`px-md py-xs rounded-full font-label-sm transition-all whitespace-nowrap ${selectedDepts.length === 0 ? 'bg-primary text-on-primary shadow-sm hover:shadow-md' : 'bg-surface-container-high text-on-surface-variant hover:bg-secondary-container'}`}
              onClick={() => { setSelectedDepts([]); setCurrentPage(1); }}
            >
              All Depts
            </button>
            {practiceAreas.slice(0, 6).map(area => (
              <button 
                key={area.id}
                onClick={() => handleDeptToggle(area.name)}
                className={`px-md py-xs rounded-full font-label-sm transition-all whitespace-nowrap ${selectedDepts.includes(area.name) ? 'bg-primary text-on-primary shadow-sm' : 'bg-surface-container-high text-on-surface-variant hover:bg-secondary-container'}`}
              >
                {area.name}
              </button>
            ))}
          </div>
        </div>
      </section>

      <div className="flex flex-col lg:flex-row gap-lg">
        {/* Sidebar Filters */}
        <aside className="w-full lg:w-72 shrink-0">
          <div className="sticky top-24 space-y-md">
            <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-md">
              <h3 className="font-label-md text-on-surface mb-md flex items-center justify-between">
                Advanced Filters
                <span className="material-symbols-outlined text-sm">tune</span>
              </h3>
              <div className="space-y-md">
                <div>
                  <label className="font-label-sm text-outline mb-sm block">Hourly Rate Range</label>
                  <div className="px-xs">
                    <input 
                      className="w-full h-2 bg-surface-container-high rounded-full appearance-none cursor-pointer accent-primary" 
                      max="10000" 
                      min="500" 
                      type="range" 
                      value={maxRate}
                      onChange={e => { setMaxRate(Number(e.target.value)); setCurrentPage(1); }}
                    />
                    <div className="flex justify-between mt-sm text-label-sm text-on-surface-variant">
                      <span>BDT 500/hr</span>
                      <span className="font-bold text-primary">Up to BDT {maxRate}/hr</span>
                      <span>BDT 10k+</span>
                    </div>
                  </div>
                </div>
                
                <hr className="border-outline-variant"/>
                
                <div>
                  <label className="font-label-sm text-outline mb-sm block">Specialization & Expertise</label>
                  <div className="space-y-3 max-h-64 overflow-y-auto hide-scrollbar">
                    {practiceAreas.map(area => {
                      const subs = legalExpertise.filter(e => e.practice_area_id === area.id);
                      return (
                        <div key={area.id} className="space-y-1.5">
                          <label className="flex items-center gap-sm cursor-pointer group font-semibold">
                            <input 
                              type="checkbox"
                              checked={selectedDepts.includes(area.name)}
                              onChange={() => handleDeptToggle(area.name)}
                              className="w-4 h-4 rounded border-outline text-primary focus:ring-primary" 
                            />
                            <span className="font-body-sm text-primary group-hover:text-secondary-fixed">
                              {area.name}
                            </span>
                          </label>
                          {subs.length > 0 && (
                            <div className="pl-6 space-y-1 border-l border-outline-variant/60 ml-2">
                              {subs.map(sub => (
                                <label key={sub.id} className="flex items-center gap-2 cursor-pointer group">
                                  <input 
                                    type="checkbox"
                                    checked={selectedDepts.includes(sub.name)}
                                    onChange={() => handleDeptToggle(sub.name)}
                                    className="w-3.5 h-3.5 rounded border-outline text-secondary focus:ring-secondary" 
                                  />
                                  <span className="text-xs text-on-surface-variant group-hover:text-on-surface">
                                    {sub.name}
                                  </span>
                                </label>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
                
                <hr className="border-outline-variant"/>
                
                <div>
                  <label className="font-label-sm text-outline mb-sm block">Availability</label>
                  <div className="flex flex-wrap gap-xs">
                    <button className="px-sm py-1 bg-primary-fixed text-on-primary-fixed font-label-sm rounded-full">Immediate</button>
                    <button className="px-sm py-1 bg-surface-container-high text-on-surface-variant font-label-sm rounded-full">Next Week</button>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="relative rounded-xl overflow-hidden aspect-[4/5] shadow-lg group cursor-pointer hidden lg:block">
              <img className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" alt="Law Office" src="https://lh3.googleusercontent.com/aida-public/AB6AXuAhdkzMu8ZXcaDtOPe2aWmHduERpTH2g0InV0oUm_s8S488RasmuyhVA7qDVcstCY2yqKZygdvvJyIC5aVr1tdRvpCLZAHHoAx7mHSKKgAvB0PPTqC0Yf10LQkS7s-RDGWryJvfGFXdjXgX90twTtnHm4_czwLERPozdV5aincp3bbbIAcAsfJkGs8E8876COdx3_JY0ftr6ml2yOwbl0X0ZXmvlIIxx63htyTPfQ9D1M0Bc27ZQRTLRqf9fZasmlYUOgHYVY-Hc6lQ"/>
              <div className="absolute inset-0 bg-gradient-to-t from-primary/90 to-transparent flex flex-col justify-end p-md text-white">
                <p className="font-label-sm uppercase tracking-widest opacity-80 mb-xs">Featured Advisory</p>
                <h4 className="font-headline-md leading-tight mb-sm">Premium Corporate Counsel for Global Series-A Startups</h4>
                <button className="text-white border border-white/40 py-sm rounded-lg hover:bg-white hover:text-primary transition-all">Learn More</button>
              </div>
            </div>
          </div>
        </aside>

        {/* Main Content: Lawyer Grid */}
        <div className="flex-1">
          <div className="flex justify-between items-center mb-md">
            <h2 className="font-headline-md text-on-surface">{totalCount} Results Found</h2>
            <div className="flex items-center gap-sm">
              <span className="font-label-sm text-outline">Sort by:</span>
              <select 
                className="bg-transparent border-none text-label-md text-primary font-bold focus:ring-0 cursor-pointer outline-none"
                value={sortOption}
                onChange={e => { setSortOption(e.target.value); setCurrentPage(1); }}
              >
                <option>Top Rated</option>
                <option>Highest Price</option>
                <option>Lowest Price</option>
                <option>Experience</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-md">
            {loading ? (
              Array.from({ length: itemsPerPage }).map((_, i) => (
                <div key={i} className="bg-surface-container-lowest border border-outline-variant rounded-xl overflow-hidden shadow-sm flex flex-col animate-pulse h-[360px]">
                  <div className="h-48 bg-surface-container-high w-full"></div>
                  <div className="p-md flex flex-col flex-1">
                    <div className="h-6 bg-surface-container-high rounded w-2/3 mb-2"></div>
                    <div className="h-4 bg-surface-container-high rounded w-1/2 mb-4"></div>
                    <div className="h-8 bg-surface-container-high rounded w-full mt-auto"></div>
                  </div>
                </div>
              ))
            ) : lawyers.length > 0 ? (
              lawyers.map(lawyer => {
                const name = lawyer.user?.name || 'Verified Lawyer';
                const initials = name.substring(0, 2).toUpperCase();
                const profilePic = lawyer.user?.profile_picture_url;
                const slugOrId = lawyer.slug || lawyer.id || lawyer.user_id || lawyer.user?.id;

                return (
                  <div key={lawyer.id} className="bg-surface-container-lowest border border-outline-variant rounded-xl overflow-hidden shadow-sm hover:shadow-md hover:border-primary/30 transition-all group flex flex-col">
                    <div className="relative h-48 overflow-hidden bg-surface-container-high">
                      {profilePic ? (
                        <img 
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" 
                          alt={name} 
                          src={profilePic}
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-primary-container text-on-primary-container text-4xl font-bold">
                          {initials}
                        </div>
                      )}
                      
                      {lawyer.is_verified && (
                        <div className="absolute top-sm right-sm">
                          <span className="bg-emerald-500 text-white px-sm py-1 rounded-full font-label-sm flex items-center gap-xs">
                            <span className="material-symbols-outlined text-[14px]">verified</span> Verified
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="p-md flex flex-col flex-1">
                      <div className="flex justify-between items-start mb-xs">
                        <h3 className="font-headline-md text-on-surface leading-none truncate pr-2">{name}</h3>
                        <span className="text-primary font-bold shrink-0">BDT {lawyer.hourly_rate || '1000'}/hr</span>
                      </div>
                      <p className="font-body-sm text-outline mb-sm italic line-clamp-1">
                        {lawyer.specialization || 'General Practice'}
                      </p>
                      <div className="flex items-center gap-base mb-md">
                        <div className="flex text-amber-400">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <span key={i} className="material-symbols-outlined fill-current" style={{ fontVariationSettings: `'FILL' ${i < Math.round(lawyer.avg_rating || 0) ? 1 : 0}` }}>star</span>
                          ))}
                        </div>
                        <span className="font-label-sm text-on-surface-variant">({lawyer.total_reviews || 0} Reviews)</span>
                      </div>
                      <div className="mt-auto flex flex-col gap-sm">
                        <div className="flex flex-wrap gap-xs h-6 overflow-hidden">
                          {lawyer.experience_years > 0 && (
                            <span className="bg-surface-container-high px-base py-1 rounded font-label-sm text-on-surface-variant">{lawyer.experience_years} yrs exp</span>
                          )}
                          {lawyer.location && (
                            <span className="bg-surface-container-high px-base py-1 rounded font-label-sm text-on-surface-variant truncate max-w-[120px]">{lawyer.location}</span>
                          )}
                        </div>
                        <Link 
                          to={`/lawyers/${slugOrId}`}
                          className="w-full text-center block bg-primary py-sm text-white font-label-md rounded-lg hover:brightness-110 active:scale-95 transition-all"
                        >
                          View Profile
                        </Link>
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="col-span-full py-xl text-center flex flex-col items-center">
                {errorMsg ? (
                  <>
                    <span className="material-symbols-outlined text-6xl text-error mb-md">error</span>
                    <h3 className="font-headline-md text-error mb-xs">Database Error</h3>
                    <p className="font-body-md text-error max-w-md">{errorMsg}</p>
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-6xl text-outline-variant mb-md">person_off</span>
                    <h3 className="font-headline-md text-on-surface mb-xs">No lawyers found</h3>
                    <p className="font-body-md text-on-surface-variant max-w-md">Try adjusting your filters, location, or search terms to find what you're looking for.</p>
                  </>
                )}
                <button 
                  onClick={() => {
                    setSearchQuery('');
                    setLocationQuery('');
                    setSelectedDepts([]);
                    setMaxRate(10000);
                  }}
                  className="mt-md border border-primary text-primary px-lg py-sm rounded-lg font-label-md hover:bg-primary-fixed transition-all"
                >
                  Clear All Filters
                </button>
              </div>
            )}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <nav className="mt-xl flex items-center justify-between border-t border-outline-variant pt-lg">
              <button 
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(p => p - 1)}
                className="flex items-center gap-xs text-on-surface-variant hover:text-primary font-label-md transition-all active:scale-95 disabled:opacity-30 disabled:hover:text-on-surface-variant"
              >
                <span className="material-symbols-outlined">arrow_back</span> Previous
              </button>
              
              <div className="hidden md:flex gap-base items-center">
                {Array.from({ length: totalPages }).map((_, i) => {
                  const page = i + 1;
                  // Show current, first, last, and pages close to current
                  if (page === 1 || page === totalPages || (page >= currentPage - 1 && page <= currentPage + 1)) {
                    return (
                      <button 
                        key={page}
                        onClick={() => setCurrentPage(page)}
                        className={`w-10 h-10 rounded-lg transition-colors ${currentPage === page ? 'bg-primary text-on-primary font-bold shadow-sm' : 'hover:bg-surface-container-high font-body-md text-on-surface'}`}
                      >
                        {page}
                      </button>
                    );
                  }
                  // Show ellipses
                  if (page === currentPage - 2 || page === currentPage + 2) {
                    return <span key={page} className="w-10 h-10 flex items-center justify-center text-on-surface-variant">...</span>;
                  }
                  return null;
                })}
              </div>

              <button 
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(p => p + 1)}
                className="flex items-center gap-xs text-on-surface-variant hover:text-primary font-label-md transition-all active:scale-95 disabled:opacity-30 disabled:hover:text-on-surface-variant"
              >
                Next <span className="material-symbols-outlined">arrow_forward</span>
              </button>
            </nav>
          )}
        </div>
      </div>
    </main>
  );
};

export default LawyerSearch;
