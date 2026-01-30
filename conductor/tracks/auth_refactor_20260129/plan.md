# Implementation Plan - Auth Refactoring

## Phase 1: Context & Core Logic
- [ ] Task: Review and Polish `AuthContext.tsx`
    - [ ] Analyze current `cleanupAuthRedirectUrl` logic for robustness.
    - [ ] Ensure `onAuthStateChange` subscription is properly managed.
    - [ ] Verify error handling in `init` function.
    - [ ] Write Unit Tests for `AuthContext` (mocking Supabase client).
- [ ] Task: Conductor - User Manual Verification 'Phase 1' (Protocol in workflow.md)

## Phase 2: UI Components
- [ ] Task: Finalize `AccountMenu.tsx`
    - [ ] Verify Avatar fallback logic (Image -> Initials -> Icon).
    - [ ] Ensure "Click Outside" handler works correctly.
    - [ ] Verify accessibility attributes.
    - [ ] Style polish (spacing, colors in Dark/Light modes).
- [ ] Task: Integrate and Verify in `Header.tsx`
    - [ ] Check layout alignment with other header elements.
    - [ ] Ensure responsive behavior (mobile/desktop).
- [ ] Task: Conductor - User Manual Verification 'Phase 2' (Protocol in workflow.md)

## Phase 3: Integration & cleanup
- [ ] Task: Verify `ProjectsMenu` integration
    - [ ] Check that cloud sections appear/disappear based on auth status.
    - [ ] Verify `CloudProjects` authentication flow.
- [ ] Task: Final System Check
    - [ ] Run full application lint and build.
    - [ ] Manual test of full Login/Logout flow.
- [ ] Task: Conductor - User Manual Verification 'Phase 3' (Protocol in workflow.md)
