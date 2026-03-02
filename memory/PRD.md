# Shadow Escalation - PRD

## Problem Statement
Shadow Escalation feature: Manager escalates approval to Super Admin. The `escalated_to` column was saving as `null` because the Supabase query to find the Super Admin ID was failing silently (RLS on `employees` table blocking Managers from reading).

## Solution
Rewrote `handleEscalateToAdmin` with a two-tier admin lookup:
1. **Primary**: Find admin from already-loaded `approvers` state (bypasses RLS entirely)
2. **Fallback**: Direct Supabase `.maybeSingle()` query (won't throw on 0 rows like `.single()` did)
3. **Hard abort**: If both fail, `return` before the update — never writes `null`

## All Changes Made

### Iteration 1: Core pipeline fixes
- Replaced broken `.or()` fetch with `Promise.all` dual-query (later simplified to `escalated_to`-based `.or()`)
- Fixed `canTakeActionOnApproval` guard in both rendering paths
- Fixed realtime `isRowRelevantToCurrentUser` blind spot
- Added `currentUser.role` to `loadApprovals` dependency array

### Iteration 2: `escalated_to` column
- Added `escalated_to` to TypeScript type, row mapping, equality check, create mapping
- `handleEscalateToAdmin` looks up admin and writes `escalated_to: adminId`
- `loadApprovals` simplified to `.or('approver_id.eq.X,escalated_to.eq.X')`
- `canTakeActionOnApproval` and realtime check use `escalated_to`

### Iteration 3: Silent failure fix
- Primary admin lookup from `approvers` state (no Supabase query needed)
- Fallback `.maybeSingle()` query (checks both 'super_admin' and 'owner' roles)
- Hard abort with `return` if no admin found — never saves null
- Detailed `console.error` at every failure point with full Supabase error objects
- SQL provided for employees table RLS

## SQL Required
1. `escalated_to` column + index on `approvals`
2. RLS policies on `approvals` (SELECT, UPDATE, INSERT)
3. RLS SELECT policy on `employees` for authenticated users

## Backlog
- P2: Multi-admin escalation routing
- P2: Escalation audit trail
- P3: Push notification on escalation
