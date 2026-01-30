# Specification: Auth Refactoring & Account Menu

## Goal
Complete the refactoring of the authentication context (`AuthContext.tsx`) and the Account Menu component (`AccountMenu.tsx`) to ensure robust session management, correct state handling, and a polished user interface.

## Core Requirements

### 1. Authentication Context (`AuthContext.tsx`)
- **Session Management:** correctly initialize and maintain Supabase session state.
- **URL Cleanup:** reliably remove OAuth parameters (`code`, `state`, `access_token`, etc.) from the URL after a successful redirect login without triggering page reloads or loops.
- **State Exposure:** expose clear states: `loading`, `disabled` (if no Supabase client), `signed_in`, `signed_out`, `error`.
- **User Metadata:** ensure user metadata (avatar, name) is correctly retrieved and updated.

### 2. Account Menu (`AccountMenu.tsx`)
- **Visual States:**
    - **Loading:** show a spinner or loading text.
    - **Signed Out:** show a "Sign In" button/avatar.
    - **Signed In:** show the user's avatar (or initials) and name.
    - **Error:** display error messages clearly (e.g., failed login).
- **Interactions:**
    - Click to open dropdown.
    - "Continue with Google" button triggers login.
    - "Logout" button triggers logout and closes menu.
    - Click outside closes the menu.
- **Accessibility:** properly use ARIA attributes (`aria-expanded`, `role="menu"`).

### 3. Integration
- **Header:** ensure `AccountMenu` is correctly positioned and styled within the `Header` component.
- **Projects Menu:** ensure the `ProjectsMenu` correctly reflects the auth state (already partially implemented, needs verification).

## Non-Functional Requirements
- **Code Style:** adhere to the project's TypeScript and React style guides.
- **Performance:** minimal re-renders; use `useMemo` and `useCallback` appropriately.
- **Error Handling:** graceful degradation if Supabase is offline or misconfigured.
