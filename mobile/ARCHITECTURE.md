# Mobile Architecture Spec (Finalized)

## Product Fit

- Target: Paying SMB teams (B2B SaaS)
- Primary KPIs: DAU, Task Completion Rate
- Launch: 4-week MVP
- Backing services: Existing Supabase DB + RLS + Edge Functions + OneSignal

## System Principles

1. Keep backend authority in Supabase.
2. Keep mobile client thin, typed, and modular.
3. Prevent role logic drift by sharing role constraints in typed guards.
4. Optimize for maintainability over short-term feature hacks.

## Architecture Overview

### Client Runtime

- React Native + Expo
- Navigation: React Navigation (Root stack + tabs)
- Server state: TanStack Query
- Client state: Zustand
- Forms: React Hook Form + Zod

### Data and Security

- Supabase Auth session is source of truth.
- Data reads/writes pass through repositories under `features/*/repository`.
- Multi-tenancy enforced by existing `company_id` RLS policies.
- Role access:
  - `super_admin` / `owner`: full team and task administration
  - `manager`: task + staff management
  - `staff`: execution only

### Realtime and Sync

- Online-first with limited offline support for v1.
- Realtime: Supabase Realtime task subscriptions invalidate and refetch task queries.
- Offline v1: cached reads and queued retry-friendly mutations can be added incrementally.

## Folder Structure

```txt
mobile/
  App.tsx
  src/
    app/
      navigation/
      providers/
      screens/
    features/
      auth/
      tasks/
      teams/
      settings/
    components/
      ui/
      patterns/
    services/
      api/
      storage/
      sync/
      notifications/
    state/
    theme/
      tokens/
      semantic/
    utils/
    types/
```

## Data Model Draft (Client Contract)

### User Profile

- `id`
- `email`
- `name`
- `role` (`super_admin | owner | manager | staff`)
- `companyId`

### Task

- `id`
- `description`
- `status` (`pending | in-progress | completed`)
- `assignedTo`
- `assignedBy`
- `companyId`
- `createdAt`
- `deadline`
- `recurrenceType` (`one_time | daily | weekly | monthly`)
- `requirePhoto`

### Team Member

- `id`
- `name`
- `email`
- `mobile`
- `role`
- `companyId`

## API Interaction Strategy

1. All feature calls go through repositories:
   - `tasksRepository`
   - `authRepository`
   - `teamRepository`
2. Repositories return normalized domain objects.
3. Query keys:
   - `['session']`
   - `['profile']`
   - `['tasks', companyId, userId, role]`
   - `['team', companyId]`
4. Mutations are optimistic only where rollback is safe.

## Navigation Structure

1. Root:
   - `AuthStack`
   - `AppTabs`
2. Tabs:
   - `Tasks`
   - `Team`
   - `Settings`
3. Role-conditional navigation:
   - Hide/disable team management actions for `staff`.

## Lumina Design System

### Visual Direction

- Soft neutral surfaces, floating cards, subtle glass effect
- Pastel status accents (success/info/warn/danger)
- High readability and generous spacing

### Tokenization

- Primitive tokens:
  - `colors`, `spacing`, `radii`, `typography`
- Semantic tokens:
  - `bg.app`, `bg.card`, `text.primary`, `status.success`, `action.primary`
- UI primitives consume semantic tokens only.

## Implementation Roadmap

1. Scaffold app shell and providers.
2. Wire Supabase auth + session hydration.
3. Build role-aware navigation and guards.
4. Build task list + task tile + realtime updates.
5. Build team screen and staff creation flow (role constrained).
6. Integrate OneSignal device registration and push entry points.
7. Harden with error boundaries, retries, and telemetry hooks.

## Current Scaffold Status

- Completed:
  - app shell, providers, navigation, auth bootstrap
  - initial screens (`SignIn`, `Tasks`, `Team`, `Settings`)
  - repositories for auth/tasks/team
  - realtime task subscription invalidating task queries
  - Lumina UI primitives and semantic token usage
- Next:
  - create/edit task flow with recurrence UI and validation
  - member creation flow with role-filtered assignment options
  - OneSignal subscription sync (`employees.onesignal_id`)
  - offline cache + retry queue for selected mutations

## Risks and Tradeoffs

1. Overloading UI layer with Supabase calls increases coupling.
   - Mitigation: repository pattern.
2. Realtime invalidation too broad can cause battery/network noise.
   - Mitigation: scope subscriptions by table/event and company-aware query keys.
3. Offline mutation support can become complex quickly.
   - Mitigation: keep v1 online-first and add queued writes only for specific actions.
