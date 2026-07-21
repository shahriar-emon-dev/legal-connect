import { detectLegalCategory, extractLocationAndNeed } from '../services/aiAdvisor.service';

// Pure-logic tests for the AI Advisor's keyword-based routing. These functions
// don't touch Supabase, but aiAdvisor.service.js imports the client at module
// scope (which now throws fast if REACT_APP_SUPABASE_URL/KEY aren't set — see
// src/services/supabase.js), so mock it out the same way ProtectedRoute.test.jsx
// does. Without this, the suite fails to load in any environment that doesn't
// have real Supabase credentials configured (e.g. GitHub Actions CI).
jest.mock('../services/supabase', () => ({
  supabase: {
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
    }),
    rpc: jest.fn().mockResolvedValue({ data: null, error: null }),
  },
}));

describe('detectLegalCategory', () => {
  it('detects Family Law from divorce-related keywords', () => {
    const result = detectLegalCategory('I want to file for divorce and need child custody arrangements');
    expect(result.category).toBe('Family Law');
    expect(result.confidence).toBe('high');
  });

  it('detects Criminal Law from arrest-related keywords', () => {
    const result = detectLegalCategory('My brother was arrested by the police and needs bail');
    expect(result.category).toBe('Criminal Law');
  });

  it('detects Property Law from land/tenant keywords', () => {
    const result = detectLegalCategory('My landlord is trying to evict me from the rented flat');
    expect(result.category).toBe('Property Law');
  });

  it('returns no category for empty or irrelevant input', () => {
    expect(detectLegalCategory('').category).toBeNull();
    expect(detectLegalCategory('hello there').confidence).toBe('none');
  });

  it('handles non-string input safely', () => {
    expect(detectLegalCategory(undefined)).toEqual({ category: null, confidence: 'none', matchedKeywords: [] });
    expect(detectLegalCategory(null)).toEqual({ category: null, confidence: 'none', matchedKeywords: [] });
  });
});

describe('extractLocationAndNeed', () => {
  it('extracts a known Bangladeshi city and normalizes its spelling', () => {
    expect(extractLocationAndNeed('I live in chittagong').location).toBe('Chattogram');
    expect(extractLocationAndNeed('I am based in dhaka').location).toBe('Dhaka');
  });

  it('returns null location when no known city is mentioned', () => {
    expect(extractLocationAndNeed('I need help with a contract').location).toBeNull();
  });

  it('classifies urgent need type from emergency language', () => {
    expect(extractLocationAndNeed('please help, my son was just arrested').needType).toBe('urgent');
  });

  it('classifies case need type from litigation language', () => {
    expect(extractLocationAndNeed('I want to sue my former employer in court').needType).toBe('case');
  });

  it('defaults to consultation need type otherwise', () => {
    expect(extractLocationAndNeed('what are my rights as a tenant').needType).toBe('consultation');
  });
});
