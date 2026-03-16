# TaskPro Mobile (Expo)

This app is the React Native mobile client for the existing TaskPro SaaS backend.

## Stack

- Expo + React Native + TypeScript
- Supabase (existing live backend, RLS, Realtime, Edge Functions)
- TanStack Query (server state)
- Zustand (client/session UI state)
- React Navigation (native stack + tabs)
- OneSignal (push notifications)

## Implemented Scaffold (v0)

- Auth bootstrap + sign in flow with Supabase session persistence
- Role-aware tab shell (`Tasks`, `Team`, `Settings`)
- Task list repository + realtime invalidation by `company_id`
- Team list repository scoped by `company_id`
- Lumina tokenized design foundation (colors, spacing, typography, radii)
- Shared UI primitives (`AppScreen`, `AppCard`, `AppButton`, `AppTextInput`, `Badge`, `Avatar`)

## Quick Start

1. Copy env file:
   - `cp .env.example .env`
2. Set:
   - `EXPO_PUBLIC_SUPABASE_URL`
   - `EXPO_PUBLIC_SUPABASE_ANON_KEY`
   - `EXPO_PUBLIC_ONESIGNAL_APP_ID`
3. Install:
   - `npm install`
4. Run:
   - `npm run start`

## Notes

- This mobile app intentionally reuses the existing multi-tenant data model (`company_id`) and role model (`super_admin`, `owner`, `manager`, `staff`).
- Access control remains server-enforced via Supabase RLS.
- Realtime task updates are subscribed via Supabase Realtime channels.
