# CampusBite

CampusBite is a vegetarian college canteen ordering app and college database mini project. Students can browse the menu, place orders, and track them through a single automatic kitchen preparation queue.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/campusbite/src/App.tsx` — menu, cart, favorites, orders, and admin UI
- `artifacts/campusbite/src/lib/campusbite.ts` — Supabase/local-demo data access and queue manager
- `artifacts/campusbite/supabase/migrations/` — SQL updates for the existing Supabase order schema
- `artifacts/campusbite/public/assets/` — CampusBite logo and original menu photography

## Architecture decisions

- Keep the supplied Supabase RPC workflow when the app is configured with Supabase.
- Use local storage only when Supabase settings are absent; local demo orders stay in one browser.
- Persist preparation start times so countdowns resume after a refresh.

## Product

Students can search vegetarian dishes, manage a cart, place orders, save favorites, and track kitchen progress. The admin area retains order, menu, inventory, and sales-report sections.

## User preferences

- Preserve the existing CampusBite experience and branding when adding features.

## Gotchas

- Supabase mode requires applying the CampusBite queue migration before starting the app.
- Local demo orders do not sync between devices or users.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
