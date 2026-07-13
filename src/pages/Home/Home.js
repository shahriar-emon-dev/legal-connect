import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../../services/supabase";


const Home = () => {
  const [departments, setDepartments] = useState([]);
  const [recentUpdates, setRecentUpdates] = useState([]);
  const [featuredLawyers, setFeaturedLawyers] = useState([]);
  const [loadingLawyers, setLoadingLawyers] = useState(true);
  const [heroLawyer, setHeroLawyer] = useState(null);

  useEffect(() => {
    fetchData();
    // Simple animation trigger (from the HTML script)
    const observerOptions = { threshold: 0.1 };
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('opacity-100', 'translate-y-0');
          entry.target.classList.remove('opacity-0', 'translate-y-4');
        }
      });
    }, observerOptions);

    const sections = document.querySelectorAll('.animate-section');
    sections.forEach(section => {
      section.classList.add('transition-all', 'duration-700', 'opacity-0', 'translate-y-4');
      observer.observe(section);
    });

    return () => observer.disconnect();
  }, []);

  const fetchData = async () => {
    try {
      // Fetch Departments
      const { data: deptData } = await supabase
        .from('departments')
        .select('*')
        .eq('is_active', true)
        .limit(8);
      
      if (deptData) setDepartments(deptData);

      // Fetch Legal Updates
      const { data: updatesData } = await supabase
        .from('legal_updates')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(3);
        
      if (updatesData) setRecentUpdates(updatesData);

      // Fetch Real Verified Lawyers dynamically
      setLoadingLawyers(true);
      let lawyersList = null;
      try {
        const { data: rpcData, error: rpcErr } = await supabase.rpc('search_lawyers', {
          p_verified_only: true,
          p_limit: 8,
          p_offset: 0
        });
        if (!rpcErr && rpcData && rpcData.length > 0) {
          lawyersList = rpcData.map(item => ({
            id: item.id,
            full_name: item.name || 'Verified Advocate',
            specialty: item.specialization || 'General Practice',
            hourly_rate: item.hourly_rate || 2000,
            rating: item.avg_rating || 5.0,
            reviews_count: item.total_reviews || 0,
            experience_years: item.experience_years || 5,
            profile_image_url: item.profile_picture_url || "https://images.unsplash.com/photo-1560250097-0b93528c311a?w=200&auto=format&fit=crop"
          }));
        }
      } catch (e) {}

      if (!lawyersList) {
        try {
          const { data: rawLawyers } = await supabase
            .from('lawyers')
            .select('*, user:users(name, profile_picture_url)')
            .eq('is_verified', true)
            .limit(8);
          if (rawLawyers && rawLawyers.length > 0) {
            lawyersList = rawLawyers.map(l => ({
              id: l.id,
              full_name: l.user?.name || l.full_name || 'Verified Advocate',
              specialty: l.specialization || 'General Practice',
              hourly_rate: l.hourly_rate || 2000,
              rating: l.avg_rating || 5.0,
              reviews_count: l.total_reviews || 0,
              experience_years: l.experience_years || 5,
              profile_image_url: l.user?.profile_picture_url || l.profile_image_url || l.profile_picture_url || "https://images.unsplash.com/photo-1560250097-0b93528c311a?w=200&auto=format&fit=crop"
            }));
          }
        } catch (e) {}
      }

      const finalLawyers = lawyersList || [];
      setFeaturedLawyers(finalLawyers);
      if (finalLawyers.length > 0) {
        setHeroLawyer(finalLawyers[0]);
      }
    } catch (err) {
      console.error('Failed to load home data', err);
    } finally {
      setLoadingLawyers(false);
    }
  };

  const displayDepts = departments.length > 0 ? departments : [
    { id: 1, name: "Family Law", icon: "family_restroom", color: "bg-blue-100 text-blue-800", count: 142 },
    { id: 2, name: "Civil Litigation", icon: "gavel", color: "bg-purple-100 text-purple-800", count: 89 },
    { id: 3, name: "Corporate", icon: "business", color: "bg-green-100 text-green-800", count: 215 },
    { id: 4, name: "Criminal", icon: "balance", color: "bg-red-100 text-red-800", count: 67 }
  ];

  const displayUpdates = recentUpdates.length > 0 ? recentUpdates : [
    { id: 1, category: 'Regulations', title: 'New Amendments to the Digital Security Act 2024', content: 'Understanding the latest changes in data privacy and digital reporting for businesses operating in Bangladesh...', created_at: '2024-10-12', image: "https://lh3.googleusercontent.com/aida-public/AB6AXuBtYfV9eGoNGr7TkckccMZscLJSk1Hi6cCk1uG5sIesO_gLeP4Ov0EQD2dx6TY7d3RneDA0ns4YHa1Tz7ANbK3hyKu--ATjNPkLN4rJ4jItHXngiYgPrV92CLb7uuPHXgd04NRks4rFtrIxBGCzeCNFFVGahCh820_iolbtjS3FRyWbd1BK_tiKz_ZqgR6FJgXRI8Mv9UmotbaZ1adxWxiSPxqT2vcEc-SIpt-WO00rCILyRtJ_5SyG9Qkir0LU6l3k6aGl5bBq-662" },
    { id: 2, category: 'Family Law', title: 'Rights of Inheritance: A Comprehensive Guide for 2024', content: 'A detailed breakdown of succession laws for various faiths and how to manage property transfers within the family...', created_at: '2024-10-10', image: "https://lh3.googleusercontent.com/aida-public/AB6AXuC8p9go-iq4aBp1SPhficcP9orAW-lODM2KazNSz8Ior1buvyKSnVD9jI2No0KK2Q_nM8LMUscTDcVRDXrgwyswC98ErgfLdXz3Ixe7yCEC0KuyNZnv7o6gYKrTHWnOWKnpikx2doInyKRULEO5gn_yBJnmd8DyD7s3mEHMTRmxaJjmVSmSZ0OxNjfiPwPWZD85UyiGBycDuWFgnFo4nJtkl83KS1Y7rYMKUXoy8EcSptJrEQHxUzVsqA4H4TIdX-gx00RHQOfq1Sia" },
    { id: 3, category: 'Business', title: 'Startup Registration: Legal Checklist for Entrepreneurs', content: 'From trade licenses to VAT registration, here is everything you need to know before launching your venture in Dhaka...', created_at: '2024-10-08', image: "https://lh3.googleusercontent.com/aida-public/AB6AXuA8BdbfF7rtZ0YUaggFA6LciOXKXeF8Q2ppoSL_9JUmF2xqYR9FHwe8JMJchc5UwBfAnYOWSgkhSPNG2kBjmMarL9OOkWNV7PPKFlpe9CFYNya699NBdYgKxWuOj1XIeqTK3Bn964r6Hpw3K8wj7ATt7FIo5aue1soRlxNc2Qh5q0E47arxgdF9yR7g4y5Jyon7bKlaGZQzmU4DaNSelJQ_-MxdtXSTAA1eJjodvdfQNc3MUG1mlMYa70KU0dHfRmQgfj1Jcbyhlr3R" }
  ];

  return (
    <div className="bg-background font-body-md text-on-background selection:bg-secondary-fixed selection:text-on-secondary-fixed">
      
      {/* Hero Section */}
      <section className="diagonal-pattern py-20 px-6 overflow-hidden animate-section">
        <div className="max-w-container-max mx-auto grid md:grid-cols-2 items-center gap-12">
          <div className="space-y-8 animate-fade-in">
            <h1 className="text-white font-display-lg text-5xl md:text-6xl leading-tight">
              Find the <span className="gold-underline italic">Right</span> Lawyer for Your Case
            </h1>
            <p className="text-on-primary-container text-lg max-w-lg">
              Access Bangladesh's most trusted network of legal professionals. Whether it's corporate law, family disputes, or criminal defense, we connect you with expertise that delivers.
            </p>
            <div className="flex flex-wrap gap-4">
              <Link to="/jobs/post" className="bg-secondary-fixed text-on-secondary-fixed px-8 py-3 rounded font-bold hover:bg-secondary transition-colors duration-200 shadow-lg active:scale-95">
                Post a Case
              </Link>
              <Link to="/lawyers" className="border border-white text-white px-8 py-3 rounded font-bold hover:bg-white/10 transition-colors duration-200 active:scale-95">
                Find a Lawyer
              </Link>
            </div>
          </div>

          <div className="relative hidden md:block">
            {/* Dynamic Profile Card Mockup */}
            {heroLawyer && (
              <div className="bg-white p-8 rounded-lg shadow-2xl max-w-sm ml-auto transform rotate-3 hover:rotate-0 transition-transform duration-500 relative z-10">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-16 h-16 rounded-full bg-surface-container-high overflow-hidden">
                    <img alt={heroLawyer.full_name} className="w-full h-full object-cover" src={heroLawyer.profile_image_url}/>
                  </div>
                  <div>
                    <h3 className="font-headline-sm text-primary">{heroLawyer.full_name}</h3>
                    <p className="text-body-sm text-on-surface-variant">Verified Legal Expert</p>
                  </div>
                </div>
                <div className="space-y-3 mb-6">
                  <div className="flex justify-between border-b border-surface-container-high pb-2">
                    <span className="text-on-surface-variant">Experience</span>
                    <span className="font-bold">{heroLawyer.experience_years || 5}+ Years</span>
                  </div>
                  <div className="flex justify-between border-b border-surface-container-high pb-2">
                    <span className="text-on-surface-variant">Specialization</span>
                    <span className="font-bold text-secondary line-clamp-1">{heroLawyer.specialty}</span>
                  </div>
                  <div className="flex justify-between border-b border-surface-container-high pb-2">
                    <span className="text-on-surface-variant">Consultation</span>
                    <span className="font-bold">BDT {heroLawyer.hourly_rate}/hr</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Link to={`/lawyers/${heroLawyer.id}`} className="flex-1 bg-primary text-white py-2 text-center rounded text-sm font-bold">View Profile</Link>
                </div>
              </div>
            )}
            {/* Decorative Elements */}
            <div className="absolute -bottom-4 -left-4 w-24 h-24 bg-secondary-fixed/20 rounded-full blur-2xl"></div>
            <div className="absolute -top-10 right-10 w-32 h-32 bg-primary-container/30 rounded-full blur-3xl"></div>
          </div>
        </div>
      </section>

      {/* Trust Bar */}
      <div className="bg-surface-container-highest py-6 border-b border-outline-variant animate-section">
        <div className="max-w-container-max mx-auto px-6 flex flex-wrap justify-center md:justify-between items-center gap-8">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-primary text-3xl">verified_user</span>
            <div>
              <p className="font-bold text-xl leading-none">500+</p>
              <p className="text-body-sm text-on-surface-variant">Verified Lawyers</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-primary text-3xl">gavel</span>
            <div>
              <p className="font-bold text-xl leading-none">12,000+</p>
              <p className="text-body-sm text-on-surface-variant">Cases Resolved</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-primary text-3xl">groups</span>
            <div>
              <p className="font-bold text-xl leading-none">50k+</p>
              <p className="text-body-sm text-on-surface-variant">Happy Clients</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-primary text-3xl">location_on</span>
            <div>
              <p className="font-bold text-xl leading-none">64</p>
              <p className="text-body-sm text-on-surface-variant">Districts Covered</p>
            </div>
          </div>
        </div>
      </div>

      {/* Featured Lawyers Section */}
      <section className="py-20 px-6 max-w-container-max mx-auto animate-section">
        <div className="flex flex-col md:flex-row justify-between items-end mb-12 gap-4">
          <div>
            <h2 className="font-headline-md text-3xl text-primary mb-2">Top-Rated Legal Experts</h2>
            <p className="text-on-surface-variant">Hand-picked professionals with proven track records in various jurisdictions.</p>
          </div>
          <Link className="text-primary font-bold flex items-center gap-1 hover:gap-2 transition-all" to="/lawyers">
            View All Professionals <span className="material-symbols-outlined">arrow_forward</span>
          </Link>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {loadingLawyers ? (
             <p className="col-span-4 text-center text-on-surface-variant py-8">Loading verified legal experts...</p>
          ) : featuredLawyers.length === 0 ? (
            <div className="col-span-4 text-center py-12 bg-surface-container-low rounded-lg border border-outline-variant">
              <span className="material-symbols-outlined text-4xl text-outline mb-2">person_off</span>
              <h3 className="font-bold text-lg text-primary mb-1">No Verified Lawyers Found</h3>
              <p className="text-body-sm text-on-surface-variant max-w-md mx-auto mb-4">
                We are currently verifying and onboarding legal professionals. Check back soon or browse our full directory.
              </p>
              <Link to="/lawyers" className="inline-block px-6 py-2 bg-primary text-white rounded font-bold hover:bg-primary-container hover:text-primary transition-colors">
                Browse Directory
              </Link>
            </div>
          ) : (
            featuredLawyers.map(l => (
              <div key={l.id} className="bg-white rounded-lg shadow-sm border border-outline-variant border-t-4 border-t-secondary-fixed p-6 hover:shadow-md transition-shadow group">
                <div className="relative w-24 h-24 mx-auto mb-4">
                  <img src={l.profile_image_url || "https://images.unsplash.com/photo-1560250097-0b93528c311a?w=200&auto=format&fit=crop"} className="w-full h-full object-cover rounded-full border-2 border-surface-container-high" alt={l.full_name} />
                  <span className="absolute bottom-1 right-1 bg-secondary text-white w-6 h-6 rounded-full flex items-center justify-center text-[12px] material-symbols-outlined verified-badge" title="Verified">verified</span>
                </div>
                <div className="text-center mb-6">
                  <h4 className="font-headline-sm text-primary line-clamp-1">{l.full_name}</h4>
                  <p className="text-on-surface-variant text-body-sm">{l.specialty || 'General Practice'}</p>
                  <div className="flex items-center justify-center gap-1 mt-2">
                    <span className="material-symbols-outlined text-secondary-fixed text-lg verified-badge">star</span>
                    <span className="font-bold text-on-surface">{l.rating || '5.0'}</span>
                    {l.reviews_count > 0 && <span className="text-outline text-sm">({l.reviews_count} reviews)</span>}
                  </div>
                </div>
                <div className="flex justify-between items-center mb-6 bg-surface-container-low p-2 rounded">
                  <span className="text-body-sm">Hourly Rate</span>
                  <span className="font-bold text-primary">BDT {l.hourly_rate || '2,000'}</span>
                </div>
                <div className="space-y-2">
                  <Link to={`/lawyers/${l.slug || l.id}`} className="block w-full py-2 border border-primary text-primary text-center font-bold rounded hover:bg-primary hover:text-white transition-colors duration-200">View Profile</Link>
                  <Link to={`/book-appointment/${l.id}`} className="block w-full py-2 bg-secondary-fixed text-on-secondary-fixed text-center font-bold rounded hover:bg-secondary transition-colors duration-200">Book Consultation</Link>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {/* How It Works Section */}
      <section className="bg-surface-container py-20 px-6 animate-section">
        <div className="max-w-container-max mx-auto text-center mb-16">
          <h2 className="font-headline-md text-3xl text-primary mb-4">Getting Legal Help is Simple</h2>
          <p className="text-on-surface-variant max-w-2xl mx-auto">Our platform streamlines the entire legal process from finding counsel to finalizing your case.</p>
        </div>
        <div className="max-w-container-max mx-auto grid md:grid-cols-4 gap-8 relative">
          <div className="hidden md:block absolute top-12 left-0 w-full h-0.5 bg-secondary-fixed/50 -z-0"></div>
          
          <div className="relative z-10 flex flex-col items-center text-center">
            <div className="w-16 h-16 bg-secondary-fixed rounded-full flex items-center justify-center text-on-secondary-fixed text-2xl font-bold mb-6 ring-8 ring-white shadow-lg">1</div>
            <h4 className="font-bold text-primary mb-2">Post Your Case</h4>
            <p className="text-body-sm text-on-surface-variant px-4">Describe your legal requirements and set your budget.</p>
          </div>
          
          <div className="relative z-10 flex flex-col items-center text-center">
            <div className="w-16 h-16 bg-secondary-fixed rounded-full flex items-center justify-center text-on-secondary-fixed text-2xl font-bold mb-6 ring-8 ring-white shadow-lg">2</div>
            <h4 className="font-bold text-primary mb-2">Receive Bids</h4>
            <p className="text-body-sm text-on-surface-variant px-4">Qualified lawyers will review your case and offer proposals.</p>
          </div>
          
          <div className="relative z-10 flex flex-col items-center text-center">
            <div className="w-16 h-16 bg-secondary-fixed rounded-full flex items-center justify-center text-on-secondary-fixed text-2xl font-bold mb-6 ring-8 ring-white shadow-lg">3</div>
            <h4 className="font-bold text-primary mb-2">Select Expert</h4>
            <p className="text-body-sm text-on-surface-variant px-4">Compare profiles, reviews, and rates to choose your advocate.</p>
          </div>
          
          <div className="relative z-10 flex flex-col items-center text-center">
            <div className="w-16 h-16 bg-secondary-fixed rounded-full flex items-center justify-center text-on-secondary-fixed text-2xl font-bold mb-6 ring-8 ring-white shadow-lg">4</div>
            <h4 className="font-bold text-primary mb-2">Resolve Faster</h4>
            <p className="text-body-sm text-on-surface-variant px-4">Communicate securely and manage documents on the portal.</p>
          </div>
        </div>
      </section>

      {/* Department Showcase */}
      <section className="py-20 px-6 max-w-container-max mx-auto animate-section">
        <h2 className="font-headline-md text-3xl text-primary mb-12 text-center">Areas of Expertise</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {displayDepts.map(d => (
            <Link to={`/lawyers?department=${d.slug || d.name}`} key={d.id || d.name} className="bg-white p-6 rounded-lg border border-outline-variant hover:border-primary cursor-pointer transition-all hover:shadow-lg group">
              <div className={`w-12 h-12 ${d.color || 'bg-blue-100 text-blue-800'} rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                <span className="material-symbols-outlined">{d.icon || 'gavel'}</span>
              </div>
              <h4 className="font-bold text-primary">{d.name}</h4>
              <p className="text-body-sm text-on-surface-variant">{d.count || 50}+ Specialists</p>
            </Link>
          ))}
        </div>
      </section>

      {/* Recent Legal Updates */}
      <section className="py-20 px-6 bg-background animate-section">
        <div className="max-w-container-max mx-auto">
          <div className="flex justify-between items-end mb-12">
            <h2 className="font-headline-md text-3xl text-primary">Legal Insights & News</h2>
            <Link className="text-primary font-bold flex items-center gap-1" to="/legal-updates">
              Read All Articles <span className="material-symbols-outlined">chevron_right</span>
            </Link>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {displayUpdates.map((update, i) => (
              <div key={update.id || i} className="bg-white rounded-lg overflow-hidden shadow-sm border border-outline-variant hover:-translate-y-1 transition-transform flex flex-col">
                <img alt={update.title} className="w-full h-48 object-cover" src={update.image || "https://images.unsplash.com/photo-1589829085413-56de8ae18c73?w=400&auto=format&fit=crop"}/>
                <div className="p-6 flex-1 flex flex-col">
                  <span className="bg-primary/10 text-primary text-[10px] uppercase font-bold px-2 py-1 rounded self-start">{update.category || 'General'}</span>
                  <h4 className="font-bold text-primary mt-3 mb-2 leading-snug">{update.title}</h4>
                  <p className="text-body-sm text-on-surface-variant line-clamp-3 mb-4">{update.content}</p>
                  <div className="mt-auto pt-4 border-t border-outline-variant flex justify-between items-center">
                    <span className="text-body-sm text-outline">{new Date(update.created_at).toLocaleDateString()}</span>
                    <Link to="/legal-updates" className="text-primary font-bold text-sm">Read More</Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer CTA */}
      <section className="diagonal-pattern py-20 px-6 text-center text-white animate-section">
        <div className="max-w-2xl mx-auto">
          <h2 className="font-display-lg text-4xl mb-6">Ready to secure your legal future?</h2>
          <p className="text-on-primary-container mb-10 text-lg">Join thousands of clients who have found expert legal representation through LegalConnect.</p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link to="/jobs/post" className="bg-secondary-fixed text-on-secondary-fixed px-10 py-4 rounded font-bold hover:bg-secondary transition-colors duration-200 shadow-xl">
              Get Started Now
            </Link>
            <Link to="/register" className="bg-white text-primary px-10 py-4 rounded font-bold hover:bg-surface-container-high transition-colors duration-200">
              Register as Lawyer
            </Link>
          </div>
        </div>
      </section>

    </div>
  );
};

export default Home;
