# Implementation Plan — Monetization Core (Cloud Storage & SaaS)

## Goal
Transform the tool into a Secure SaaS by selling cloud synchronization, organizational features (folders), and professional sharing, primarily targeting PMs and Technical Writers.

## Phase 1: Subscription Schema & RLS (The Foundation)
- [ ] **Task: Database Migration (Supabase)**
    - [ ] Add `tier` (enum: 'free', 'pro') to `profiles` table.
    - [ ] Add `storage_limit_count` and `storage_usage_count` to `profiles`.
    - [ ] Create a trigger to auto-increment/decrement `storage_usage_count` on `projects` table changes.
- [ ] **Task: Row Level Security (RLS) Enforcement**
    - [ ] Update `INSERT` policy on `projects`: Allow only if `storage_usage_count < storage_limit_count` for 'free' users.
    - [ ] Ensure 'pro' users have 'infinity' or high limit.

## Phase 2: PM-Centric UI (Organization & Limits)
- [ ] **Task: Project Folders / Tags**
    - [ ] Update `projects` schema to support `folder_id` or `tags`.
    - [ ] Implement a folder navigation sidebar in `ChatProjects.tsx`.
    - [ ] *Value for PMs:* Ability to group diagrams by feature/sprint.
- [ ] **Task: Usage Indicators**
    - [ ] Add a storage quota progress bar in `AccountMenu.tsx`.
    - [ ] Create a "Pro" badge for the UI.
    - [ ] Implement a "Storage Full" modal with an "Upgrade" CTA.

## Phase 3: The "Share" Hook (Live Links & E2EE)
- [ ] **Task: Secure Read-Only Sharing**
    - [ ] Implement `share_links` table (token, project_id, expires_at).
    - [ ] Create a "Public/Secret Link" toggle in the UI.
    - [ ] *Technical:* Ensure E2EE keys are handled for shared links (e.g., passing fragment hash for decryption).
- [ ] **Task: Analytics for PMs**
    - [ ] Simple "View Counter" for shared links.
    - [ ] *Value:* PMs can see if their team/stakeholders actually looked at the diagram.

## Phase 4: Billing & Automation
- [ ] **Task: Payment Provider Integration (LemonSqueezy/Stripe)**
    - [ ] Set up Checkout flow (redirect to hosted page).
    - [ ] Implement Supabase Edge Function to handle Webhooks (Update `tier` on payment).
- [ ] **Task: "No-Log" Marketing implementation**
    - [ ] Add a landing section explaining *why* our cloud is better than Git (E2EE + No-Key AI).

## Success Metrics
- Conversion rate from Free to Pro (target: 2-5%).
- Average projects per PM user (target: >10).
- Shared links generated per Pro user.
