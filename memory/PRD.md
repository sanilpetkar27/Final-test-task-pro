# Shadow Escalation Bug Fix - PRD

## Original Problem Statement
The "Shadow Escalation" feature in the Approvals system was broken. A Manager clicks "Escalate to Admin", the DB write succeeds (isEscalated=true, adminEscalationStatus=PENDING confirmed), but the Super Admin cannot see the escalated request in their "Needs My Approval" inbox.

## Architecture
- Frontend: React + TypeScript + Vite + Supabase JS Client (direct from frontend)
- Database: Supabase (PostgreSQL via PostgREST)
- Key file: `/app/components/ApprovalsPanel.tsx`

## Root Cause Analysis (4 bugs found + RLS evaluation)

### Bug 1: Fetch Query - PostgREST `.or()` parsing failure (PRIMARY)
- Replaced broken `.or('and(...,status.in.(...)),and(...)')` with two parallel queries via `Promise.all`, merged and deduplicated by ID.

### Bug 2: `canTakeActionOnApproval` guard blocks Super Admin actions
- Added OR condition for `super_admin + isEscalated + PENDING` in both rendering paths.

### Bug 3: Realtime blind spot for Super Admin
- Added escalation-aware check to `isRowRelevantToCurrentUser()`.

### Bug 4: Missing useCallback dependency
- Added `currentUser.role` to `loadApprovals` dependency array.

### RLS Evaluation (CRITICAL - likely remaining blocker)
- If console logs show `raw rows from Supabase: 0 []`, the issue is Supabase Row Level Security.
- RLS policy on `approvals` table likely restricts reads to `requester_id = auth.uid() OR approver_id = auth.uid()`.
- Escalated items have the Manager as approver_id, NOT the Super Admin — so RLS blocks the read.
- SQL fix provided to user.

## What's Been Implemented (Jan 2026)
- All 4 code bugs fixed in `ApprovalsPanel.tsx`
- Diagnostic console.log added for debugging
- RLS bypass SQL provided
- TypeScript compilation verified clean

## Backlog
- P1: Remove diagnostic logs after confirming fix
- P2: Add visual "Escalated" badge on approval cards
- P2: Add escalation history/audit trail
- P3: Email/push notification when escalation occurs
