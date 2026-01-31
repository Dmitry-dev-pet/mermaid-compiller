# Implementation Plan: UI Polish & Monetization UX

## Goal
Upgrade the user interface from "Developer Tool" to "Commercial SaaS Workspace".
Focus on high-value aesthetics, promoting the "Pro" tier, and simplifying the experience for non-technical users (PMs).

## Phase 1: Header & Account UX (The "Money" Layer)
*Target: Increase perceived value and visibility of the Pro tier.*

- [ ] **Task: Refactor User Menu (`Header.tsx` & `AccountMenu.tsx`)**
    - [ ] Replace text buttons ("Cloud: sign in") with a professional **Avatar Trigger**.
        - [ ] Show User Avatar (image or initials).
        - [ ] Show discrete "Pro" or "Free" badge next to the name.
    - [ ] Create a rich **Dropdown Menu** (using `radix-ui` or custom tailwind).
        - [ ] Section 1: User Info.
        - [ ] Section 2: **Storage Meter** (Progress bar: "2/3 projects used").
        - [ ] Section 3: "Upgrade to Pro" action (highlighted).
        - [ ] Section 4: Settings / Logout.

- [ ] **Task: "Upgrade" Call-to-Actions (CTAs)**
    - [ ] Add a subtle, high-quality **"Upgrade" button** in the header (visible only for Free tier).
        - [ ] Style: Minimalist, maybe a gradient border or small icon, not a screaming red button.
    - [ ] Add **Locked Feature Indicators**:
        - [ ] In `ThemeMenu`: Add a locked "Custom Theme" option with a padlock icon.
        - [ ] In Export Menu: Add "Export High-Res (Pro)" with a padlock.
    - [ ] Implement a reusable `UpgradeModal` component explaining the benefits (E2EE, Unlimited Storage, Team Sync).

## Phase 2: Workspace Layout (The "Manager" Layer)
*Target: Make the tool friendly for PMs who don't want to see code.*

- [ ] **Task: View Mode Switcher**
    - [ ] Add state `viewMode: 'split' | 'canvas' | 'code'` to `App.tsx` (or `useDiagramStudio`).
    - [ ] Create a segmented control `[ Code | Split | Canvas ]` in the top toolbar.
    - [ ] **Logic:**
        - [ ] `Split`: Standard 50/50 view.
        - [ ] `Canvas`: Editor width = 0%, Preview = 100%. (Hide resizer).
        - [ ] `Code`: Editor width = 100%.

- [ ] **Task: "Canvas First" Experience**
    - [ ] When in `Canvas` mode:
        - [ ] Floating Action Button (FAB) or Toolbar for common actions (Zoom, Export, AI Edit).
        - [ ] Double-click on diagram element -> Opens AI Chat with context "Edit this node".

## Phase 3: File Explorer (The "Organizer" Layer)
*Target: Move from "Temporary Tabs" to "Permanent Projects".*

- [ ] **Task: Left Sidebar Implementation**
    - [ ] Refactor `ChatProjects.tsx` from a dropdown into a **Collapsible Left Sidebar**.
    - [ ] Structure:
        - [ ] Search bar.
        - [ ] "Recent" section.
        - [ ] "Folders" tree (UI only for now, prep for backend).
        - [ ] "Trash" / Archive.
    - [ ] Drag & Drop support for organizing projects (future proofing).

## Technical Notes
- **Styling:** Use Tailwind CSS for consistent spacing and typography.
- **Icons:** Use `lucide-react` (consistent with current design).
- **State:** Persist `viewMode` and `sidebarOpen` in `localStorage`.
