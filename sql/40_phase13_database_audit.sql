-- =================================================================================
-- Migration 40: Phase 13 Database Audit & RLS Hardening
-- =================================================================================
-- Description: This migration performs a final schema gap analysis against the React
--              codebase and tightens overly permissive RLS policies left during
--              the development schema updates.
-- =================================================================================

-- 1. Ensure Contact Inquiries Table Exists (as seen in Contact.js & AdminSettings.js)
CREATE TABLE IF NOT EXISTS public.contact_inquiries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT,
    subject TEXT,
    message TEXT NOT NULL,
    status TEXT DEFAULT 'unread', -- unread, read, replied
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW())
);

ALTER TABLE public.contact_inquiries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can insert inquiries" ON public.contact_inquiries;
CREATE POLICY "Public can insert inquiries" 
ON public.contact_inquiries FOR INSERT 
WITH CHECK (true);

DROP POLICY IF EXISTS "Admins can view inquiries" ON public.contact_inquiries;
CREATE POLICY "Admins can view inquiries" 
ON public.contact_inquiries FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.users 
    WHERE users.id = auth.uid() AND users.user_type = 'admin'
  )
);

DROP POLICY IF EXISTS "Admins can update inquiries" ON public.contact_inquiries;
CREATE POLICY "Admins can update inquiries" 
ON public.contact_inquiries FOR UPDATE 
USING (
  EXISTS (
    SELECT 1 FROM public.users 
    WHERE users.id = auth.uid() AND users.user_type = 'admin'
  )
);

DROP POLICY IF EXISTS "Admins can delete inquiries" ON public.contact_inquiries;
CREATE POLICY "Admins can delete inquiries" 
ON public.contact_inquiries FOR DELETE 
USING (
  EXISTS (
    SELECT 1 FROM public.users 
    WHERE users.id = auth.uid() AND users.user_type = 'admin'
  )
);

-- 2. Harden RLS for Contracts (Replacing permissive 'Allow all' policy)
DROP POLICY IF EXISTS "Allow all authenticated for contracts" ON public.contracts;
DROP POLICY IF EXISTS "Users can view own contracts" ON public.contracts;
DROP POLICY IF EXISTS "Users can insert own contracts" ON public.contracts;
DROP POLICY IF EXISTS "Users can update own contracts" ON public.contracts;
DROP POLICY IF EXISTS "Users can update own contracts" ON public.contracts;

CREATE POLICY "Users can view own contracts" 
ON public.contracts FOR SELECT 
USING (auth.uid() = client_id OR auth.uid() = lawyer_id);

CREATE POLICY "Users can insert own contracts" 
ON public.contracts FOR INSERT 
WITH CHECK (auth.uid() = client_id OR auth.uid() = lawyer_id);

CREATE POLICY "Users can update own contracts" 
ON public.contracts FOR UPDATE 
USING (auth.uid() = client_id OR auth.uid() = lawyer_id);


-- 3. Harden RLS for Conversations
DROP POLICY IF EXISTS "Allow all authenticated for conversations" ON public.conversations;
DROP POLICY IF EXISTS "Users can view own conversations" ON public.conversations;
DROP POLICY IF EXISTS "Users can insert own conversations" ON public.conversations;
DROP POLICY IF EXISTS "Users can update own conversations" ON public.conversations;

CREATE POLICY "Users can view own conversations" 
ON public.conversations FOR SELECT 
USING (auth.uid() = client_id OR auth.uid() = lawyer_id);

CREATE POLICY "Users can insert own conversations" 
ON public.conversations FOR INSERT 
WITH CHECK (auth.uid() = client_id OR auth.uid() = lawyer_id);

CREATE POLICY "Users can update own conversations" 
ON public.conversations FOR UPDATE 
USING (auth.uid() = client_id OR auth.uid() = lawyer_id);


-- 4. Harden RLS for Messages
DROP POLICY IF EXISTS "Allow all authenticated for messages" ON public.messages;
DROP POLICY IF EXISTS "Users can view own messages" ON public.messages;
DROP POLICY IF EXISTS "Users can insert messages" ON public.messages;
DROP POLICY IF EXISTS "Users can update own messages" ON public.messages;

CREATE POLICY "Users can view own messages" 
ON public.messages FOR SELECT 
USING (
  auth.uid() = sender_id 
  OR auth.uid() = receiver_id
  OR EXISTS (
    SELECT 1 FROM public.conversations c 
    WHERE c.id = messages.conversation_id 
    AND (c.client_id = auth.uid() OR c.lawyer_id = auth.uid())
  )
);

CREATE POLICY "Users can insert messages" 
ON public.messages FOR INSERT 
WITH CHECK (
  auth.uid() = sender_id
);

CREATE POLICY "Users can update own messages" 
ON public.messages FOR UPDATE 
USING (
  auth.uid() = sender_id OR auth.uid() = receiver_id
);


-- 5. Harden RLS for Appointments
DROP POLICY IF EXISTS "Allow all authenticated for appointments" ON public.appointments;
DROP POLICY IF EXISTS "Users can view own appointments" ON public.appointments;
DROP POLICY IF EXISTS "Users can insert own appointments" ON public.appointments;
DROP POLICY IF EXISTS "Users can update own appointments" ON public.appointments;

CREATE POLICY "Users can view own appointments" 
ON public.appointments FOR SELECT 
USING (auth.uid() = client_id OR auth.uid() = lawyer_id);

CREATE POLICY "Users can insert own appointments" 
ON public.appointments FOR INSERT 
WITH CHECK (auth.uid() = client_id OR auth.uid() = lawyer_id);

CREATE POLICY "Users can update own appointments" 
ON public.appointments FOR UPDATE 
USING (auth.uid() = client_id OR auth.uid() = lawyer_id);


-- 6. Add Performance Indexes
CREATE INDEX IF NOT EXISTS idx_contact_inquiries_status ON public.contact_inquiries(status);
CREATE INDEX IF NOT EXISTS idx_contracts_status ON public.contracts(status);
CREATE INDEX IF NOT EXISTS idx_appointments_status ON public.appointments(status);
CREATE INDEX IF NOT EXISTS idx_appointments_date ON public.appointments(scheduled_at);


-- Platform Configuration
CREATE TABLE IF NOT EXISTS public.platform_commission_config (
    id INTEGER PRIMARY KEY,
    commission_percentage NUMERIC NOT NULL DEFAULT 10,
    updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW())
);
INSERT INTO public.platform_commission_config (id, commission_percentage) VALUES (1, 10) ON CONFLICT (id) DO NOTHING;
