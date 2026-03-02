# Shadow Escalation - PRD

## Problem Statement
Shadow Escalation feature: Manager escalates an approval to Super Admin. DB write works (isEscalated=true, adminEscalationStatus=PENDING). Super Admin's "Needs My Approval" inbox was empty due to broken read/render pipeline + RLS blocking.

## Solution: `escalated_to` Column
Added a dedicated `escalated_to` UUID column that stores the target Super Admin's ID. This trivializes the entire pipeline — query, RLS, rendering — by making escalation a simple ownership check identical to `approver_id`.

## Changes Made (Jan 2026)

### Code Changes (`components/ApprovalsPanel.tsx`)
1. **Type**: Added `escalated_to?: string | null` to `ApprovalItem`
2. **Escalation Write**: `handleEscalateToAdmin` now looks up a Super Admin via `employees.role = 'super_admin'` and sets `escalated_to: adminId`
3. **Fetch Logic**: Simplified from complex `Promise.all` dual-query to single `.or('approver_id.eq.X,escalated_to.eq.X')`
4. **Action Guard**: `canTakeActionOnApproval` uses `approval.escalated_to === currentUser.id` (both render paths)
5. **Realtime**: `isRowRelevantToCurrentUser` checks `escalated_to` field
6. **Equality Check**: `approvalsAreEqual` includes `escalated_to`
7. **Create mapping**: New approvals default `escalated_to: null`

### SQL Required (run in Supabase Dashboard)
- Add `escalated_to` UUID column
- Drop old RLS policies
- Create new trivial RLS policies using `approver_id` OR `escalated_to`

## Backlog
- P2: Multi-admin escalation routing (pick specific admin)
- P2: Escalation audit trail
- P3: Push notification on escalation
