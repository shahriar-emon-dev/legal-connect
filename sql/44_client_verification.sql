-- =============================================================================
-- Migration 44: Add Client Verification Fields
-- =============================================================================

-- Add verification tracking directly to public.users for clients
ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS is_verified BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS verification_status verification_status_enum NOT NULL DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS nid_document_url TEXT;

-- (The profile_picture_url already exists in public.users)
