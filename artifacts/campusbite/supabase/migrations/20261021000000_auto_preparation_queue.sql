-- CampusBite automatic preparation queue.
-- Apply this migration to the existing CampusBite Supabase project before
-- enabling Supabase mode. Order placement and customer lookup stay on the
-- existing RPCs; these functions serialize global kitchen queue transitions.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS preparation_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS preparation_seconds integer NOT NULL DEFAULT 15,
  ADD COLUMN IF NOT EXISTS ready_at timestamptz;

-- Existing manually-started orders resume with a fresh demo timer.
UPDATE public.orders
SET preparation_started_at = now(), preparation_seconds = 15
WHERE status = 'Preparing' AND preparation_started_at IS NULL;

CREATE OR REPLACE FUNCTION public.claim_next_preparation_order(p_duration_seconds integer DEFAULT 15)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_id integer;
BEGIN
  IF p_duration_seconds IS NULL OR p_duration_seconds < 1 OR p_duration_seconds > 3600 THEN
    RAISE EXCEPTION 'Preparation duration must be between 1 and 3600 seconds';
  END IF;

  -- One database-wide lock protects competing browsers and devices.
  PERFORM pg_advisory_xact_lock(823417211);

  IF EXISTS (SELECT 1 FROM public.orders WHERE status = 'Preparing') THEN
    RETURN NULL;
  END IF;

  SELECT id INTO v_order_id
  FROM public.orders
  WHERE status = 'Placed'
  ORDER BY created_at ASC, id ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF v_order_id IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE public.orders
  SET status = 'Preparing',
      preparation_started_at = now(),
      preparation_seconds = p_duration_seconds,
      ready_at = NULL
  WHERE id = v_order_id;

  RETURN v_order_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.finish_due_preparation()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_id integer;
BEGIN
  PERFORM pg_advisory_xact_lock(823417211);

  SELECT id INTO v_order_id
  FROM public.orders
  WHERE status = 'Preparing'
    AND preparation_started_at IS NOT NULL
    AND preparation_started_at + make_interval(secs => preparation_seconds) <= now()
  ORDER BY preparation_started_at ASC, id ASC
  LIMIT 1
  FOR UPDATE;

  IF v_order_id IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE public.orders
  SET status = 'Ready', ready_at = now()
  WHERE id = v_order_id AND status = 'Preparing';

  RETURN v_order_id;
END;
$$;

-- Keep the existing RPC contract and add the timer fields to its JSON rows.
CREATE OR REPLACE FUNCTION public.get_orders_by_ids(p_ids int[])
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(jsonb_agg(o ORDER BY o.id DESC), '[]'::jsonb)
  FROM (
    SELECT ord.id, ord.status, ord.order_type, ord.total, ord.created_at,
      ord.preparation_started_at, ord.preparation_seconds, ord.ready_at,
      c.name AS customer,
      (SELECT jsonb_agg(jsonb_build_object(
        'name', m.name, 'qty', oi.quantity, 'price', oi.unit_price
      ))
       FROM public.order_items oi
       JOIN public.menu_items m ON m.id = oi.menu_item_id
       WHERE oi.order_id = ord.id) AS items
    FROM public.orders ord
    LEFT JOIN public.customers c ON c.id = ord.customer_id
    WHERE ord.id = ANY(p_ids)
  ) o;
$$;

GRANT EXECUTE ON FUNCTION public.claim_next_preparation_order(integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finish_due_preparation() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_orders_by_ids(int[]) TO anon, authenticated;

-- Keep the existing admin control working with persisted preparation timestamps.
CREATE OR REPLACE FUNCTION public.admin_update_status(p_pin text, p_order_id int, p_status text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.check_admin(p_pin);
  IF p_status NOT IN ('Placed', 'Preparing', 'Ready', 'Completed') THEN
    RAISE EXCEPTION 'Invalid order status';
  END IF;
  UPDATE public.orders
  SET status = p_status,
      preparation_started_at = CASE
        WHEN p_status = 'Preparing' THEN COALESCE(preparation_started_at, now())
        ELSE preparation_started_at
      END,
      preparation_seconds = CASE
        WHEN p_status = 'Preparing' THEN COALESCE(preparation_seconds, 15)
        ELSE preparation_seconds
      END,
      ready_at = CASE WHEN p_status = 'Ready' THEN now() ELSE ready_at END
  WHERE id = p_order_id;
END;
$$;
