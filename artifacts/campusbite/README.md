# CampusBite

CampusBite is a vegetarian college-canteen ordering app with a single FIFO preparation queue. Orders take 15 seconds to prepare by default; set `VITE_PREPARATION_SECONDS` to change the demo duration.

## Local demo mode

When Supabase variables are not configured, the app clearly identifies itself as local demo mode. Menu edits, favourites, orders, queue status and inventory are saved in this browser's local storage. The queue resumes from persisted start times after refresh and is coordinated across tabs with the browser's Web Locks API. Local demo data is not shared with other devices or users. Queue transitions run while the app is open; after all tabs close, saved start times are reconciled when the app opens again.

## Supabase mode

To keep using the existing CampusBite Supabase data:

1. Configure `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` through the workspace's secret/environment settings. Do not commit these values.
2. Apply `supabase/migrations/20261021000000_auto_preparation_queue.sql` to the existing Supabase project.
3. Restart the app. It continues to use the existing menu, order-placement, customer-order, and admin RPCs. The migration adds persisted timer fields and database-serialized queue claim/complete RPCs. Database locking prevents tabs from claiming separate orders at the same time. The queue is driven by an open app session, and stored timestamps let the next session reconcile timers after a refresh or closed tab.

If Supabase variables are only partially configured, the app reports a configuration error instead of silently switching to local storage.
