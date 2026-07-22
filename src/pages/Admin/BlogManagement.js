import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { supabase, isMissingFunctionError } from '../../services/supabase';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';

const BLOG_IMAGE_BUCKET = 'blog-images';
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif'];

const STATUSES = [
  { key: 'draft', label: 'Draft', color: 'bg-gray-200 text-gray-600' },
  { key: 'published', label: 'Published', color: 'bg-green-100 text-green-700' },
  { key: 'scheduled', label: 'Scheduled', color: 'bg-blue-100 text-blue-700' },
  { key: 'archived', label: 'Archived', color: 'bg-amber-100 text-amber-700' },
];
const statusMeta = (s) => STATUSES.find((x) => x.key === String(s || 'draft').toLowerCase()) || STATUSES[0];
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-US', { dateStyle: 'medium' }) : '—');

const emptyForm = {
  id: null, title: '', slug: '', excerpt: '', content: '', category: 'General',
  tags: '', featured_image_url: '', status: 'draft', is_featured: false, is_pinned: false,
  published_at: '', seo_title: '', seo_description: '', seo_keywords: '',
};

const BlogManagement = () => {
  const { user } = useAuth();
  const [posts, setPosts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const [editing, setEditing] = useState(null); // form object or null
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showCats, setShowCats] = useState(false);
  const [newCat, setNewCat] = useState('');
  const fileInputRef = useRef(null);

  const fetchPosts = useCallback(async () => {
    try {
      setError(null);
      const { data, error: err } = await supabase
        .from('legal_updates')
        .select('*, author:users!legal_updates_author_id_fkey(name)')
        .order('created_at', { ascending: false });
      if (err) {
        // author FK alias may not exist on older schemas — retry plain.
        const { data: d2, error: e2 } = await supabase.from('legal_updates').select('*').order('created_at', { ascending: false });
        if (e2) throw e2;
        setPosts(d2 || []);
      } else {
        setPosts(data || []);
      }
    } catch (err) {
      console.error('[BlogManagement] fetch error:', err);
      setError(err.message || 'Failed to load posts.');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchCategories = useCallback(async () => {
    const { data } = await supabase.from('blog_categories').select('*').order('sort_order');
    setCategories(data || []);
  }, []);

  const fetchStats = useCallback(async () => {
    try {
      const { data, error: err } = await supabase.rpc('fn_blog_stats');
      if (err) { if (isMissingFunctionError(err)) { setStats(null); return; } throw err; }
      setStats(data);
    } catch { setStats(null); }
  }, []);

  useEffect(() => { fetchPosts(); fetchCategories(); fetchStats(); }, [fetchPosts, fetchCategories, fetchStats]);

  useEffect(() => {
    let t = null;
    const refresh = () => { if (t) clearTimeout(t); t = setTimeout(() => { fetchPosts(); fetchStats(); }, 400); };
    const ch = supabase.channel('admin_blog').on('postgres_changes', { event: '*', schema: 'public', table: 'legal_updates' }, refresh).subscribe();
    return () => { if (t) clearTimeout(t); supabase.removeChannel(ch); };
  }, [fetchPosts, fetchStats]);

  const derivedStats = useMemo(() => {
    if (stats) return stats;
    const live = posts.filter((p) => !p.deleted_at);
    const c = (s) => live.filter((p) => String(p.status || 'draft').toLowerCase() === s).length;
    return {
      total: live.length, published: c('published'), draft: c('draft'), scheduled: c('scheduled'),
      archived: c('archived'), featured: live.filter((p) => p.is_featured).length,
      views: live.reduce((sum, p) => sum + (p.view_count || 0), 0),
    };
  }, [stats, posts]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return posts.filter((p) => {
      if (p.deleted_at) return false;
      if (statusFilter !== 'all' && String(p.status || 'draft').toLowerCase() !== statusFilter) return false;
      if (q) {
        const hay = `${p.title || ''} ${p.excerpt || ''} ${p.category || ''} ${(p.tags || []).join(' ')}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [posts, search, statusFilter]);

  // ── Mutations ──
  const openNew = () => setEditing({ ...emptyForm });
  const openEdit = (p) => setEditing({
    id: p.id, title: p.title || '', slug: p.slug || '', excerpt: p.excerpt || '', content: p.content || '',
    category: p.category || 'General', tags: (p.tags || []).join(', '), featured_image_url: p.featured_image_url || '',
    status: String(p.status || 'draft').toLowerCase(), is_featured: !!p.is_featured, is_pinned: !!p.is_pinned,
    published_at: p.published_at ? p.published_at.slice(0, 16) : '', seo_title: p.seo_title || '',
    seo_description: p.seo_description || '', seo_keywords: p.seo_keywords || '',
  });

  const save = async (statusOverride) => {
    if (!editing.title.trim()) { toast.error('Title is required.'); return; }
    if (!editing.content.trim()) { toast.error('Content is required.'); return; }
    setBusy(true);
    try {
      const payload = {
        title: editing.title.trim(),
        slug: editing.slug.trim() || null, // trigger auto-generates when null
        excerpt: editing.excerpt.trim() || null,
        content: editing.content,
        category: editing.category,
        tags: editing.tags.split(',').map((t) => t.trim()).filter(Boolean),
        featured_image_url: editing.featured_image_url.trim() || null,
        status: statusOverride || editing.status,
        is_featured: editing.is_featured,
        is_pinned: editing.is_pinned,
        seo_title: editing.seo_title.trim() || null,
        seo_description: editing.seo_description.trim() || null,
        seo_keywords: editing.seo_keywords.trim() || null,
        author_id: user?.id || null,
        lawyer_id: user?.id || null,
      };
      if (editing.published_at) payload.published_at = new Date(editing.published_at).toISOString();

      let err;
      if (editing.id) {
        ({ error: err } = await supabase.from('legal_updates').update(payload).eq('id', editing.id));
      } else {
        ({ error: err } = await supabase.from('legal_updates').insert([payload]));
      }
      if (err) throw err;
      toast.success(editing.id ? 'Post updated.' : 'Post created.');
      setEditing(null);
      fetchPosts(); fetchStats();
    } catch (err) {
      console.error(err);
      toast.error(err.message || 'Save failed. Ensure migration 71 is applied.');
    } finally { setBusy(false); }
  };

  const uploadFeaturedImage = async (file) => {
    if (!file) return;
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      toast.error('Please choose a PNG, JPEG, WebP, or GIF image.');
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      toast.error('Image is larger than 5 MB. Please pick a smaller file.');
      return;
    }
    setUploading(true);
    try {
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
      const path = `posts/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from(BLOG_IMAGE_BUCKET)
        .upload(path, file, { cacheControl: '3600', upsert: false, contentType: file.type });
      if (upErr) throw upErr;
      // Public bucket → stable, non-expiring URL.
      const { data: pub } = supabase.storage.from(BLOG_IMAGE_BUCKET).getPublicUrl(path);
      if (!pub?.publicUrl) throw new Error('Could not resolve uploaded image URL.');
      setEditing((prev) => ({ ...prev, featured_image_url: pub.publicUrl }));
      toast.success('Image uploaded.');
    } catch (err) {
      console.error('[BlogManagement] image upload error:', err);
      toast.error(err.message?.includes('Bucket not found')
        ? 'Upload bucket missing — apply migration 72 (blog-images bucket).'
        : (err.message || 'Image upload failed.'));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const quickPatch = async (p, patch, msg) => {
    try {
      const { error: err } = await supabase.from('legal_updates').update(patch).eq('id', p.id);
      if (err) throw err;
      toast.success(msg);
      fetchPosts(); fetchStats();
    } catch (err) { toast.error(err.message || 'Update failed.'); }
  };

  const softDelete = async (p) => {
    if (!window.confirm(`Delete "${p.title}"? It will be hidden but recoverable.`)) return;
    quickPatch(p, { deleted_at: new Date().toISOString(), status: 'archived' }, 'Post deleted.');
  };

  const duplicate = async (p) => {
    try {
      const { id, created_at, updated_at, slug, view_count, published_at, ...rest } = p;
      const { error: err } = await supabase.from('legal_updates').insert([{
        ...rest, title: `${p.title} (Copy)`, slug: null, status: 'draft', is_featured: false, view_count: 0, published_at: null,
      }]);
      if (err) throw err;
      toast.success('Post duplicated as draft.');
      fetchPosts(); fetchStats();
    } catch (err) { toast.error(err.message || 'Duplicate failed.'); }
  };

  const addCategory = async () => {
    if (!newCat.trim()) return;
    try {
      const slug = newCat.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const { error: err } = await supabase.from('blog_categories').insert([{ name: newCat.trim(), slug, sort_order: categories.length + 1 }]);
      if (err) throw err;
      setNewCat(''); fetchCategories(); toast.success('Category added.');
    } catch (err) { toast.error(err.message || 'Failed to add category.'); }
  };
  const toggleCategory = async (c) => {
    await supabase.from('blog_categories').update({ is_active: !c.is_active }).eq('id', c.id);
    fetchCategories();
  };
  const deleteCategory = async (c) => {
    if (!window.confirm(`Delete category "${c.name}"?`)) return;
    await supabase.from('blog_categories').delete().eq('id', c.id);
    fetchCategories();
  };

  const catOptions = categories.length ? categories.map((c) => c.name) : ['General', 'Corporate Law', 'Family Law', 'Criminal Law', 'Real Estate', 'Immigration', 'Tax Law', 'Employment Law'];

  const statCards = [
    { label: 'Total', value: derivedStats.total, tone: 'text-navy-primary' },
    { label: 'Published', value: derivedStats.published, tone: 'text-green-600' },
    { label: 'Drafts', value: derivedStats.draft, tone: 'text-gray-600' },
    { label: 'Scheduled', value: derivedStats.scheduled, tone: 'text-blue-600' },
    { label: 'Featured', value: derivedStats.featured, tone: 'text-amber-600' },
    { label: 'Total Views', value: derivedStats.views, tone: 'text-indigo-600' },
  ];

  return (
    <div className="p-4 md:p-8 max-w-[1400px] mx-auto">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-serif font-bold text-navy-primary">Blog / Legal Updates</h1>
          <p className="text-sm text-gray-500 mt-1">Create and publish articles that appear on the public Legal Updates page.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowCats(true)} className="px-4 py-2.5 rounded-xl text-sm font-semibold border border-border-subtle bg-white text-gray-600">Categories</button>
          <button onClick={openNew} className="px-4 py-2.5 rounded-xl text-sm font-bold bg-navy-primary text-white">+ New Post</button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-6">
        {statCards.map((s) => (
          <div key={s.label} className="p-4 rounded-2xl border border-border-subtle bg-white">
            <div className={`text-2xl font-bold ${s.tone}`}>{s.value ?? 0}</div>
            <div className="text-xs text-gray-500 mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-col md:flex-row gap-3 mb-4">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search title, tags, category…" className="flex-1 px-4 py-2.5 rounded-xl border border-border-subtle text-sm" />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="px-4 py-2.5 rounded-xl border border-border-subtle text-sm bg-white">
          <option value="all">All statuses</option>
          {STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="p-12 text-center text-gray-400 animate-pulse">Loading posts…</div>
      ) : error ? (
        <div className="p-8 text-center bg-red-50 border border-red-200 rounded-2xl text-red-600">
          <p className="font-bold">Couldn't load posts</p><p className="text-sm mt-1">{error}</p>
          <button onClick={fetchPosts} className="mt-3 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-bold">Retry</button>
        </div>
      ) : visible.length === 0 ? (
        <div className="p-16 text-center bg-bg-light/40 rounded-2xl border border-dashed border-border-subtle">
          <div className="text-4xl mb-2 opacity-40">📰</div>
          <p className="font-bold text-navy-primary">No posts yet</p>
          <p className="text-xs text-gray-500 mt-1">Create your first article to populate the Legal Updates page.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border-subtle bg-white">
          <table className="w-full text-sm">
            <thead className="bg-bg-light/50 text-left text-xs uppercase tracking-wide text-gray-400">
              <tr>
                <th className="px-4 py-3">Title</th><th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Status</th><th className="px-4 py-3">Views</th>
                <th className="px-4 py-3">Published</th><th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((p) => {
                const sm = statusMeta(p.status);
                return (
                  <tr key={p.id} className="border-t border-border-subtle hover:bg-bg-light/30">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {p.is_featured && <span className="text-amber-500" title="Featured">★</span>}
                        <span className="font-semibold text-navy-primary line-clamp-1 max-w-xs">{p.title}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{p.category || 'General'}</td>
                    <td className="px-4 py-3"><span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${sm.color}`}>{sm.label}</span></td>
                    <td className="px-4 py-3 text-gray-600">{p.view_count || 0}</td>
                    <td className="px-4 py-3 text-gray-500">{fmtDate(p.published_at || p.created_at)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1.5 flex-wrap">
                        <button onClick={() => openEdit(p)} className="px-2 py-1 text-xs font-semibold bg-gray-100 rounded hover:bg-gray-200">Edit</button>
                        {String(p.status).toLowerCase() !== 'published'
                          ? <button onClick={() => quickPatch(p, { status: 'published' }, 'Published.')} className="px-2 py-1 text-xs font-semibold bg-green-100 text-green-700 rounded">Publish</button>
                          : <button onClick={() => quickPatch(p, { status: 'draft' }, 'Moved to draft.')} className="px-2 py-1 text-xs font-semibold bg-gray-100 rounded">Unpublish</button>}
                        <button onClick={() => quickPatch(p, { is_featured: !p.is_featured }, p.is_featured ? 'Unfeatured.' : 'Featured.')} className="px-2 py-1 text-xs font-semibold bg-amber-50 text-amber-700 rounded">{p.is_featured ? 'Unfeature' : 'Feature'}</button>
                        <button onClick={() => duplicate(p)} className="px-2 py-1 text-xs font-semibold bg-gray-100 rounded">Duplicate</button>
                        <button onClick={() => softDelete(p)} className="px-2 py-1 text-xs font-semibold bg-red-50 text-red-600 rounded">Delete</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Editor drawer */}
      {editing && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={() => !busy && setEditing(null)}>
          <div className="bg-white w-full max-w-2xl h-full overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 bg-white border-b border-border-subtle p-5 flex items-center justify-between z-10">
              <h3 className="text-lg font-bold text-navy-primary">{editing.id ? 'Edit Post' : 'New Post'}</h3>
              <button onClick={() => !busy && setEditing(null)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
            </div>
            <div className="p-5 space-y-4">
              <Field label="Title *"><input value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} className="ipt" /></Field>
              <Field label="Slug (auto-generated if blank)"><input value={editing.slug} onChange={(e) => setEditing({ ...editing, slug: e.target.value })} placeholder="my-article-title" className="ipt" /></Field>
              <Field label="Short description / excerpt"><textarea value={editing.excerpt} onChange={(e) => setEditing({ ...editing, excerpt: e.target.value })} rows={2} className="ipt" /></Field>
              <Field label="Content *"><textarea value={editing.content} onChange={(e) => setEditing({ ...editing, content: e.target.value })} rows={10} placeholder="Write the article. Blank lines separate paragraphs." className="ipt font-mono text-xs" /></Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Category">
                  <select value={editing.category} onChange={(e) => setEditing({ ...editing, category: e.target.value })} className="ipt">
                    {catOptions.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </Field>
                <Field label="Status">
                  <select value={editing.status} onChange={(e) => setEditing({ ...editing, status: e.target.value })} className="ipt">
                    {STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                  </select>
                </Field>
              </div>
              <Field label="Tags (comma-separated)"><input value={editing.tags} onChange={(e) => setEditing({ ...editing, tags: e.target.value })} placeholder="tax, filing, deadline" className="ipt" /></Field>
              <Field label="Featured image">
                <div className="space-y-2">
                  {editing.featured_image_url ? (
                    <div className="relative inline-block">
                      <img src={editing.featured_image_url} alt="Featured preview" className="h-32 w-auto rounded-lg border border-border-subtle object-cover" />
                      <button type="button" onClick={() => setEditing({ ...editing, featured_image_url: '' })} className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full text-sm leading-none" title="Remove image">×</button>
                    </div>
                  ) : (
                    <div
                      onClick={() => !uploading && fileInputRef.current?.click()}
                      className={`flex flex-col items-center justify-center h-32 rounded-lg border-2 border-dashed border-border-subtle text-gray-400 ${uploading ? 'opacity-60' : 'cursor-pointer hover:border-navy-primary/40 hover:text-navy-primary'}`}
                    >
                      <span className="material-symbols-outlined text-2xl">{uploading ? 'progress_activity' : 'add_photo_alternate'}</span>
                      <span className="text-xs font-semibold mt-1">{uploading ? 'Uploading…' : 'Upload image from device'}</span>
                      <span className="text-[10px]">PNG, JPEG, WebP or GIF · up to 5 MB</span>
                    </div>
                  )}
                  <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={(e) => uploadFeaturedImage(e.target.files?.[0])} />
                  <input value={editing.featured_image_url} onChange={(e) => setEditing({ ...editing, featured_image_url: e.target.value })} placeholder="…or paste an image URL" className="ipt" />
                </div>
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Publish / schedule date"><input type="datetime-local" value={editing.published_at} onChange={(e) => setEditing({ ...editing, published_at: e.target.value })} className="ipt" /></Field>
                <div className="flex items-end gap-4 pb-2">
                  <label className="flex items-center gap-2 text-sm font-semibold text-gray-600"><input type="checkbox" checked={editing.is_featured} onChange={(e) => setEditing({ ...editing, is_featured: e.target.checked })} /> Featured</label>
                  <label className="flex items-center gap-2 text-sm font-semibold text-gray-600"><input type="checkbox" checked={editing.is_pinned} onChange={(e) => setEditing({ ...editing, is_pinned: e.target.checked })} /> Pinned</label>
                </div>
              </div>
              <details className="border border-border-subtle rounded-xl p-3">
                <summary className="text-sm font-bold text-gray-600 cursor-pointer">SEO metadata</summary>
                <div className="mt-3 space-y-3">
                  <Field label="SEO title"><input value={editing.seo_title} onChange={(e) => setEditing({ ...editing, seo_title: e.target.value })} className="ipt" /></Field>
                  <Field label="SEO description"><textarea value={editing.seo_description} onChange={(e) => setEditing({ ...editing, seo_description: e.target.value })} rows={2} className="ipt" /></Field>
                  <Field label="SEO keywords"><input value={editing.seo_keywords} onChange={(e) => setEditing({ ...editing, seo_keywords: e.target.value })} className="ipt" /></Field>
                </div>
              </details>
              <div className="flex gap-2 pt-2 border-t border-border-subtle sticky bottom-0 bg-white pb-1">
                <button onClick={() => save('draft')} disabled={busy || uploading} className="px-4 py-2.5 bg-gray-100 text-gray-700 rounded-lg text-sm font-bold disabled:opacity-50">Save Draft</button>
                <button onClick={() => save('published')} disabled={busy || uploading} className="px-4 py-2.5 bg-navy-primary text-white rounded-lg text-sm font-bold disabled:opacity-50">{busy ? 'Saving…' : 'Publish'}</button>
                <button onClick={() => setEditing(null)} disabled={busy} className="ml-auto px-4 py-2.5 text-gray-500 text-sm font-semibold">Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Categories modal */}
      {showCats && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowCats(false)}>
          <div className="bg-white rounded-2xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-navy-primary">Blog Categories</h3>
              <button onClick={() => setShowCats(false)} className="text-gray-400 text-2xl leading-none">×</button>
            </div>
            <div className="flex gap-2 mb-4">
              <input value={newCat} onChange={(e) => setNewCat(e.target.value)} placeholder="New category name" className="flex-1 px-3 py-2 rounded-lg border border-border-subtle text-sm" />
              <button onClick={addCategory} className="px-3 py-2 bg-navy-primary text-white rounded-lg text-sm font-bold">Add</button>
            </div>
            <ul className="space-y-2 max-h-72 overflow-y-auto">
              {categories.map((c) => (
                <li key={c.id} className="flex items-center justify-between p-2 rounded-lg border border-border-subtle">
                  <span className={`text-sm font-semibold ${c.is_active ? 'text-gray-700' : 'text-gray-400 line-through'}`}>{c.name}</span>
                  <div className="flex gap-2">
                    <button onClick={() => toggleCategory(c)} className="text-xs font-semibold text-blue-600">{c.is_active ? 'Deactivate' : 'Activate'}</button>
                    <button onClick={() => deleteCategory(c)} className="text-xs font-semibold text-red-500">Delete</button>
                  </div>
                </li>
              ))}
              {categories.length === 0 && <li className="text-sm text-gray-400 text-center py-4">No categories yet (apply migration 71).</li>}
            </ul>
          </div>
        </div>
      )}

      <style>{`.ipt{width:100%;padding:0.6rem 0.75rem;border:1px solid #e2e8f0;border-radius:0.6rem;font-size:0.875rem;}`}</style>
    </div>
  );
};

const Field = ({ label, children }) => (
  <label className="block">
    <span className="block text-xs font-semibold text-gray-500 mb-1">{label}</span>
    {children}
  </label>
);

export default BlogManagement;
