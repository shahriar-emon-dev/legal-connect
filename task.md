# LegalConnect Production Remediation Tasks

## Phase 1 — Database & Data Layer
- [/] Fix all `.catch()` on Supabase PostgREST builders across entire codebase
  - [x] `Contact.js` — Fixed `.catch()` on `.insert()` builders (lines 153-154)
  - [ ] `AdminOverview.js` — Fix `.catch()` on multiple builder chains (lines 126-201)
  - [ ] `AdminSettings.js` — Fix `.catch()` on builder chains (lines 33, 116-117, 136-137)
  - [ ] `JobsManagement.js` — Fix `.catch()` on builder chains (lines 25-27, 45)
  - [ ] `LawyerVerifications.js` — Fix `.catch()` on builder chain (line 45)
  - [ ] `FlaggedReviews.js` — Fix `.catch()` on builder chain (line 33)
- [ ] Verify all `try/catch` blocks properly handle Supabase errors

## Phase 2 — Authentication  
- [ ] Verify Login.js handles all edge cases
- [ ] Verify Register.js handles all edge cases
- [ ] Verify AuthContext.js session restoration
- [ ] Verify ProtectedRoute.js role checking
- [ ] Verify Login.js `useEffect` clearing localStorage doesn't break session restore

## Phase 3 — Public Pages
- [ ] Verify Homepage rendering
- [ ] Verify LawyerSearch data loading
- [ ] Verify JobBoard data loading
- [ ] Verify AIAdvisor functionality
- [ ] Verify Contact form submission (already fixed TypeError)

## Phase 4 — Client Portal
- [ ] Verify ClientDashboard data loading
- [ ] Verify CaseTracking data loading
- [ ] Verify ClientMyPosts data loading
- [ ] Verify ClientCommunicationPortal messaging
- [ ] Verify AppointmentBooking functionality
- [ ] Verify ClientSettings save functionality

## Phase 5 — Lawyer Suite
- [ ] Verify LawyerDashboardView data loading
- [ ] Verify LawyerCasesView data loading
- [ ] Verify LawyerProposalsView data loading
- [ ] Verify LawyerContractsView data loading
- [ ] Verify LawyerAppointmentsView data loading

## Phase 6 — Admin Dashboard
- [ ] Verify AdminOverview accurate statistics
- [ ] Verify UsersManagement functionality
- [ ] Verify LawyerVerifications functionality
- [ ] Verify JobsManagement functionality
- [ ] Verify FlaggedReviews functionality
- [ ] Verify AdminSettings contact management

## Phase 7 — Login.js useEffect Issue
- [ ] Fix Login.js clearing tokens on mount (breaks session restore on direct navigation)

## Phase 8 — Build & Deploy
- [ ] Verify production build passes
- [ ] Commit and push all fixes
