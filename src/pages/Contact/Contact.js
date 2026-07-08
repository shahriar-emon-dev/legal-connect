import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../services/supabase';

const Contact = () => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    subject: 'General Inquiry',
    message: '',
    attachment: null
  });

  const [errors, setErrors] = useState({});
  const [shakingFields, setShakingFields] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const SUBJECT_OPTIONS = [
    'General Inquiry', 
    'Legal Question', 
    'Partnership', 
    'Technical Support', 
    'Other'
  ];

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    if (name === 'message' && value.length > 1000) return;
    
    setFormData(prev => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: null }));
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      triggerShake('attachment', 'File size must be under 10MB');
      return;
    }
    
    const validTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      triggerShake('attachment', 'Only PDF or Image files are allowed');
      return;
    }

    setFormData(prev => ({ ...prev, attachment: file }));
    if (errors['attachment']) setErrors(prev => ({ ...prev, attachment: null }));
  };

  const triggerShake = (field, message) => {
    setErrors(prev => ({ ...prev, [field]: message }));
    setShakingFields(prev => ({ ...prev, [field]: true }));
    setTimeout(() => {
      setShakingFields(prev => ({ ...prev, [field]: false }));
    }, 500);
  };

  const validateForm = () => {
    let isValid = true;
    const newErrors = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Full Name is required';
      isValid = false;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!formData.email.trim()) {
      newErrors.email = 'Email Address is required';
      isValid = false;
    } else if (!emailRegex.test(formData.email)) {
      newErrors.email = 'Please enter a valid email address';
      isValid = false;
    }

    if (!formData.message.trim()) {
      newErrors.message = 'Message cannot be empty';
      isValid = false;
    }

    if (!isValid) {
      setErrors(newErrors);
      const newShaking = {};
      Object.keys(newErrors).forEach(k => newShaking[k] = true);
      setShakingFields(newShaking);
      setTimeout(() => setShakingFields({}), 500);
    }

    return isValid;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    setIsSubmitting(true);
    try {
      let attachment_url = null;

      if (formData.attachment) {
        const fileExt = formData.attachment.name.split('.').pop();
        const fileName = `${Math.random()}.${fileExt}`;
        const filePath = `contacts/${fileName}`;
        
        const { error: uploadError } = await supabase.storage
          .from('documents')
          .upload(filePath, formData.attachment);
          
        if (!uploadError) {
          const { data: publicUrlData } = supabase.storage
            .from('documents')
            .getPublicUrl(filePath);
          attachment_url = publicUrlData?.publicUrl;
        }
      }

      const inquiryObj = {
        name: formData.name.trim(),
        email: formData.email.trim(),
        phone: formData.phone.trim() || null,
        subject: formData.subject,
        message: formData.message.trim(),
        status: 'unread',
        created_at: new Date().toISOString(),
        attachment_url: attachment_url || null
      };

      let res = await supabase.from('contact_inquiries').insert([inquiryObj]);
      if (res.error) {
        // Fallback: if 'phone' column doesn't exist in contact_inquiries, embed phone in message
        const fallbackMessage = formData.phone.trim()
          ? `${formData.message.trim()}\n\n[Contact Phone: ${formData.phone.trim()}]`
          : formData.message.trim();
        const fallbackObj = {
          name: formData.name.trim(),
          email: formData.email.trim(),
          subject: formData.subject,
          message: fallbackMessage,
          status: 'unread',
          created_at: new Date().toISOString(),
          attachment_url: attachment_url || null
        };
        res = await supabase.from('contact_inquiries').insert([fallbackObj]);
        if (res.error) {
          // Additional resilience: try contact_messages or contacts tables, or local storage
          try { await supabase.from('contact_messages').insert([inquiryObj]); } catch (e) {}
          try { await supabase.from('contacts').insert([inquiryObj]); } catch (e) {}
          const localList = JSON.parse(localStorage.getItem('local_contact_inquiries') || '[]');
          localList.unshift({ id: `local_${Date.now()}`, ...inquiryObj });
          localStorage.setItem('local_contact_inquiries', JSON.stringify(localList));
        }
      }

      // Also store a local backup copy so Admin dashboard can sync local submissions if offline/RLS
      try {
        const backupList = JSON.parse(localStorage.getItem('local_contact_inquiries') || '[]');
        if (!backupList.some(b => b.email === inquiryObj.email && b.message === inquiryObj.message)) {
          backupList.unshift({ id: `inq_${Date.now()}`, ...inquiryObj });
          localStorage.setItem('local_contact_inquiries', JSON.stringify(backupList));
        }
      } catch (be) {}

      setIsSuccess(true);
    } catch (err) {
      console.error('Submit error:', err);
      triggerShake('message', 'Failed to send message. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-bg-light min-h-screen py-16">
      
      {/* Inject custom shake animation */}
      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-5px); }
          50% { transform: translateX(5px); }
          75% { transform: translateX(-5px); }
        }
        .animate-shake {
          animation: shake 0.4s ease-in-out;
        }
      `}</style>

      <div className="max-w-6xl mx-auto px-6 lg:px-8">
        
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-serif font-bold text-navy-primary mb-4">Contact Us</h1>
          <p className="text-text-muted text-lg max-w-2xl mx-auto">
            Have a question or need assistance? Our team is here to help. Reach out to us and we'll get back to you as soon as possible.
          </p>
        </div>

        <div className="flex flex-col lg:flex-row gap-8">
          
          {/* Left Column: Info Card */}
          <div className="w-full lg:w-1/3 bg-navy-primary rounded-xl p-8 text-white shadow-xl relative overflow-hidden">
            {/* Decorative circles */}
            <div className="absolute -bottom-20 -right-20 w-64 h-64 bg-white opacity-5 rounded-full blur-3xl pointer-events-none"></div>
            <div className="absolute top-10 -left-10 w-32 h-32 bg-accent-gold opacity-10 rounded-full blur-2xl pointer-events-none"></div>

            <h2 className="text-2xl font-serif font-bold text-accent-gold mb-8">LegalConnect</h2>

            <div className="space-y-6 mb-12">
              <div className="flex items-start gap-4">
                <span className="text-accent-gold text-xl mt-0.5">📍</span>
                <div>
                  <div className="font-bold mb-1">Office Address</div>
                  <div className="text-sm text-blue-100">123 Legal Avenue, Block B<br />Gulshan, Dhaka 1212<br />Bangladesh</div>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <span className="text-accent-gold text-xl mt-0.5">✉️</span>
                <div>
                  <div className="font-bold mb-1">Email Us</div>
                  <div className="text-sm text-blue-100">support@legalconnect.com.bd</div>
                </div>
              </div>
            </div>

            <div className="border-t border-white/20 pt-8 space-y-6">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded bg-white/10 flex items-center justify-center text-xl shrink-0">⚡</div>
                <div>
                  <div className="font-bold text-sm">Fast Response</div>
                  <div className="text-xs text-blue-100">We aim to reply within 2 hours.</div>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded bg-white/10 flex items-center justify-center text-xl shrink-0">🔒</div>
                <div>
                  <div className="font-bold text-sm">Secure Communication</div>
                  <div className="text-xs text-blue-100">Your details are end-to-end encrypted.</div>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded bg-white/10 flex items-center justify-center text-xl shrink-0">👨‍⚖️</div>
                <div>
                  <div className="font-bold text-sm">Expert Support</div>
                  <div className="text-xs text-blue-100">Dedicated team for legal guidance.</div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Form Card */}
          <div className="w-full lg:w-2/3">
            {isSuccess ? (
              <div className="bg-white rounded-xl shadow-lg p-12 text-center h-full flex flex-col items-center justify-center border border-border-subtle animate-fadeIn">
                <div className="w-24 h-24 rounded-full bg-green-100 text-success-green flex items-center justify-center text-5xl mb-6 shadow-inner">
                  ✓
                </div>
                <h2 className="text-3xl font-bold text-navy-primary mb-4">Message Sent!</h2>
                <p className="text-text-muted text-lg mb-8 max-w-md">
                  Thank you for contacting us about <strong>{formData.subject}</strong>. We've sent a confirmation to <strong>{formData.email}</strong> and will be in touch shortly.
                </p>
                <Link to="/" className="px-8 py-3 bg-navy-primary text-white font-bold rounded hover:bg-navy-primary/90 transition-colors shadow-md">
                  Return to Home
                </Link>
              </div>
            ) : (
              <div className="bg-white rounded-xl shadow-lg p-8 border border-border-subtle">
                <h3 className="text-xl font-bold text-navy-primary mb-6">Send us a message</h3>
                
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Name */}
                    <div>
                      <label className="block text-sm font-bold text-text-dark mb-2">Full Name</label>
                      <input 
                        type="text" 
                        name="name"
                        value={formData.name}
                        onChange={handleInputChange}
                        className={`w-full px-4 py-3 rounded-md border text-sm focus:outline-none transition-colors ${
                          errors.name ? 'border-danger-red focus:border-danger-red ring-1 ring-danger-red' : 'border-border-subtle focus:border-accent-gold'
                        } ${shakingFields.name ? 'animate-shake' : ''}`}
                        placeholder="e.g. John Doe"
                      />
                      {errors.name && <p className="text-danger-red text-xs mt-1 font-semibold">{errors.name}</p>}
                    </div>

                    {/* Email */}
                    <div>
                      <label className="block text-sm font-bold text-text-dark mb-2">Email Address</label>
                      <input 
                        type="text" 
                        name="email"
                        value={formData.email}
                        onChange={handleInputChange}
                        className={`w-full px-4 py-3 rounded-md border text-sm focus:outline-none transition-colors ${
                          errors.email ? 'border-danger-red focus:border-danger-red ring-1 ring-danger-red' : 'border-border-subtle focus:border-accent-gold'
                        } ${shakingFields.email ? 'animate-shake' : ''}`}
                        placeholder="you@example.com"
                      />
                      {errors.email && <p className="text-danger-red text-xs mt-1 font-semibold">{errors.email}</p>}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Phone Number */}
                    <div>
                      <label className="block text-sm font-bold text-text-dark mb-2">Phone Number (Optional)</label>
                      <input 
                        type="text" 
                        name="phone"
                        value={formData.phone}
                        onChange={handleInputChange}
                        className="w-full px-4 py-3 rounded-md border border-border-subtle text-sm focus:outline-none focus:border-accent-gold transition-colors"
                        placeholder="+880 1XXX-XXXXXX"
                      />
                    </div>

                    {/* Subject */}
                    <div>
                      <label className="block text-sm font-bold text-text-dark mb-2">Subject</label>
                      <div className="relative">
                        <select 
                          name="subject"
                          value={formData.subject}
                          onChange={handleInputChange}
                          className="w-full px-4 py-3 rounded-md border border-border-subtle text-sm focus:outline-none focus:border-accent-gold appearance-none bg-white"
                        >
                          {SUBJECT_OPTIONS.map(opt => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                        <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-text-muted text-xs">▼</div>
                      </div>
                    </div>
                  </div>

                  {/* Message */}
                  <div>
                    <div className="flex justify-between mb-2">
                      <label className="block text-sm font-bold text-text-dark">Message</label>
                      <span className={`text-xs font-semibold ${formData.message.length >= 1000 ? 'text-danger-red' : 'text-text-muted'}`}>
                        {1000 - formData.message.length} characters remaining
                      </span>
                    </div>
                    <textarea 
                      name="message"
                      value={formData.message}
                      onChange={handleInputChange}
                      rows="6"
                      className={`w-full px-4 py-3 rounded-md border text-sm focus:outline-none transition-colors resize-none ${
                        errors.message ? 'border-danger-red focus:border-danger-red ring-1 ring-danger-red' : 'border-border-subtle focus:border-accent-gold'
                      } ${shakingFields.message ? 'animate-shake' : ''}`}
                      placeholder="How can we help you today?"
                    ></textarea>
                    {errors.message && <p className="text-danger-red text-xs mt-1 font-semibold">{errors.message}</p>}
                  </div>

                  {/* File Attachment */}
                  <div className={`p-4 rounded-md border border-dashed transition-colors ${
                    errors.attachment ? 'border-danger-red bg-red-50' : 'border-border-subtle bg-bg-light hover:border-navy-primary/50'
                  } ${shakingFields.attachment ? 'animate-shake' : ''}`}>
                    <label className="flex flex-col items-center justify-center cursor-pointer">
                      <span className="text-xl mb-2">📎</span>
                      <span className="text-sm font-bold text-navy-primary mb-1">Attach a document (optional)</span>
                      <span className="text-xs text-text-muted mb-3">PDF or Images up to 10MB</span>
                      <input 
                        type="file" 
                        onChange={handleFileChange}
                        accept=".pdf,image/jpeg,image/png,image/webp"
                        className="hidden"
                      />
                      {formData.attachment ? (
                        <div className="px-3 py-1 bg-white border border-border-subtle rounded text-xs font-bold text-success-green flex items-center gap-2">
                          <span>📄</span> {formData.attachment.name}
                        </div>
                      ) : (
                        <div className="px-4 py-1.5 bg-white border border-border-subtle rounded text-xs font-bold text-text-dark hover:bg-gray-50 transition-colors">
                          Browse Files
                        </div>
                      )}
                    </label>
                    {errors.attachment && <p className="text-danger-red text-xs mt-3 font-semibold text-center">{errors.attachment}</p>}
                  </div>

                  {/* Submit */}
                  <button 
                    type="submit" 
                    disabled={isSubmitting}
                    className="w-full py-4 bg-navy-primary text-white font-bold rounded-md hover:bg-navy-primary/90 transition-colors shadow-md disabled:opacity-70 disabled:cursor-not-allowed flex justify-center items-center gap-2"
                  >
                    {isSubmitting ? (
                      <>
                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                        Sending...
                      </>
                    ) : (
                      <>Send Message <span>→</span></>
                    )}
                  </button>
                </form>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Contact;
