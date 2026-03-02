# Shadow Escalation Bug Fix - PRD

## Original Problem Statement
The "Shadow Escalation" feature in the Approvals system was broken. A Manager clicks "Escalate to Admin", but the Super Admin cannot see the escalated request in their "Needs My Approval" inbox. The database write (`isEscalated: true, adminEscalationStatus: 'PENDING'`) works correctly. The problem is purely a read/render pipeline failure.

## Architecture
- Frontend: React + TypeScript + Vite + Supabase JS Client (direct from frontend)
- Database: Supabase (PostgreSQL via PostgREST)
- Key file: `/app/components/ApprovalsPanel.tsx`

## Root Cause Analysis (4 bugs found)

### Bug 1: Fetch Query - PostgREST `.or()` parsing failure (PRIMARY ROOT CAUSE)
- **Location**: `loadApprovals()`, line 392
- **Issue**: `query.or('and(approver_id.eq.UUID,status.in.(PENDING,NEEDS_REVIEW)),and(isEscalated.eq.true,adminEscalationStatus.eq.PENDING)')` uses nested `in.()` inside `and()` inside `.or()`. PostgREST's parser can silently fail with this nesting, returning empty results.
- **Fix**: Replaced with two parallel `Promise.all` queries (one for direct approvals, one for escalated items), merged and deduplicated by ID.

### Bug 2: `canTakeActionOnApproval` guard blocks Super Admin actions (SECONDARY)
- **Location**: Two rendering paths (lines ~1359 and ~1591)
- **Issue**: `approval.approver_id === currentUser.id` is `false` for escalated items because the approver_id remains the original manager's ID.
- **Fix**: Added OR condition: `(currentUser.role === 'super_admin' && approval.isEscalated && approval.adminEscalationStatus === 'PENDING')`

### Bug 3: Realtime blind spot for Super Admin
- **Location**: `isRowRelevantToCurrentUser()`, line ~509
- **Issue**: Only checks `requester_id` and `approver_id` — neither matches the Super Admin for escalated items.
- **Fix**: Added `(currentUser.role === 'super_admin' && isEscalated)` check.

### Bug 4: Missing dependency in useCallback
- **Location**: `loadApprovals` dependency array, line ~439
- **Issue**: `currentUser.role` used in query branching but not in dependency array.
- **Fix**: Added `currentUser.role` to dependency array.

## What's Been Implemented (Jan 2026)
- All 4 bugs fixed in `ApprovalsPanel.tsx`
- TypeScript compilation verified clean

## Backlog
- P2: Add visual "Escalated" badge on approval cards in Super Admin view
- P2: Add escalation history/audit trail
- P3: Email/push notification when escalation occurs
