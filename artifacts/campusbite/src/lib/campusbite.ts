import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type OrderStatus = "Placed" | "Preparing" | "Ready" | "Completed";
export type OrderType = "Dine In" | "Pick Up" | "Delivery";
export type MenuItem = {
  id: number;
  name: string;
  description: string;
  category: string;
  price: number;
  image_key: string;
  rating: number;
  available: boolean;
};
export type OrderItem = { name: string; qty: number; price: number };
export type CampusOrder = {
  id: number;
  status: OrderStatus;
  order_type: OrderType;
  total: number;
  created_at: string;
  customer: string;
  roll_no?: string;
  items: OrderItem[];
  preparation_started_at?: string | null;
  preparation_seconds?: number;
  ready_at?: string | null;
};
export type OrderInput = {
  name: string;
  roll: string;
  type: OrderType;
  items: { id: number; qty: number }[];
};
export type MenuInput = Partial<MenuItem> & {
  name: string;
  description?: string;
  category: string;
  price: number;
};

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseKey = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  import.meta.env.VITE_SUPABASE_ANON_KEY) as string | undefined;
export const isSupabaseMode = Boolean(supabaseUrl && supabaseKey);
export const isLocalDemoMode = !supabaseUrl && !supabaseKey;
export const PREPARATION_SECONDS = Math.max(
  1,
  Math.min(3600, Number(import.meta.env.VITE_PREPARATION_SECONDS) || 15),
);
export const LOCAL_DB_KEY = "campusbite.demo.database.v1";
const NOTIFIED_KEY = "campusbite.ready-notified.v1";
const QUEUE_LOCK = "campusbite.preparation-queue";

const defaultMenu: MenuItem[] = [
  { id: 1, name: "Veg Hakka Noodles", description: "Wok-tossed noodles with fresh vegetables", category: "Chinese", price: 110, image_key: "noodles", rating: 4.8, available: true },
  { id: 2, name: "Veg Manchurian", description: "Crispy veggie balls in tangy Indo-Chinese sauce", category: "Chinese", price: 95, image_key: "manchurian", rating: 4.7, available: true },
  { id: 3, name: "Schezwan Fried Rice", description: "Spicy fried rice with fresh vegetables", category: "Chinese", price: 105, image_key: "friedrice", rating: 4.6, available: true },
  { id: 4, name: "Veg Momos", description: "Steamed dumplings with spicy red chutney", category: "Fast Food", price: 80, image_key: "momos", rating: 4.9, available: true },
  { id: 5, name: "Margherita Pizza", description: "Cheesy pizza with basil and tomato", category: "Pizza", price: 160, image_key: "pizza", rating: 4.7, available: true },
  { id: 6, name: "Campus Burger", description: "Crispy patty, cheese and fresh vegetables", category: "Fast Food", price: 90, image_key: "burger", rating: 4.8, available: true },
  { id: 7, name: "Paneer Thali", description: "Paneer butter masala, dal, rice and naan", category: "Indian", price: 140, image_key: "thali", rating: 4.9, available: true },
  { id: 8, name: "Cold Coffee", description: "Chilled coffee topped with whipped cream", category: "Drinks", price: 60, image_key: "coffee", rating: 4.6, available: true },
  { id: 9, name: "Gulab Jamun", description: "Two warm jamuns soaked in rose syrup", category: "Desserts", price: 45, image_key: "gulabjamun", rating: 4.8, available: true },
];

const demoIngredients = [
  { id: 1, name: "Noodles", unit: "packs", quantity: 40, low_threshold: 10 },
  { id: 2, name: "Rice", unit: "kg", quantity: 25, low_threshold: 5 },
  { id: 3, name: "Vegetables", unit: "kg", quantity: 30, low_threshold: 5 },
  { id: 4, name: "Paneer", unit: "kg", quantity: 8, low_threshold: 2 },
  { id: 5, name: "Flour", unit: "kg", quantity: 20, low_threshold: 5 },
  { id: 6, name: "Cheese", unit: "kg", quantity: 6, low_threshold: 2 },
  { id: 7, name: "Burger Buns", unit: "pcs", quantity: 30, low_threshold: 10 },
  { id: 8, name: "Milk", unit: "L", quantity: 15, low_threshold: 4 },
  { id: 9, name: "Coffee", unit: "g", quantity: 800, low_threshold: 200 },
  { id: 10, name: "Khoya", unit: "kg", quantity: 4, low_threshold: 1 },
];

type LocalDatabase = {
  orders: CampusOrder[];
  menu: MenuItem[];
  statusLog: { id: number; order_id: number; old_status: string | null; new_status: string; changed_at: string }[];
  ingredients: { id: number; name: string; unit: string; quantity: number; low_threshold: number }[];
  nextId: number;
};

let supabaseClient: SupabaseClient | null = null;
function getSupabase(): SupabaseClient {
  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY to use the connected database.");
  }
  if (!supabaseClient) supabaseClient = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: true, autoRefreshToken: true } });
  return supabaseClient;
}

function readDatabase(): LocalDatabase {
  if (typeof window === "undefined") return { orders: [], menu: defaultMenu, statusLog: [], ingredients: demoIngredients, nextId: 1 };
  try {
    const stored = localStorage.getItem(LOCAL_DB_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as Partial<LocalDatabase>;
      const orders = Array.isArray(parsed.orders) ? parsed.orders : [];
      return {
        orders,
        menu: Array.isArray(parsed.menu) ? parsed.menu : defaultMenu,
        statusLog: Array.isArray(parsed.statusLog) ? parsed.statusLog : [],
        ingredients: Array.isArray(parsed.ingredients) ? parsed.ingredients : demoIngredients,
        nextId: Math.max(Number(parsed.nextId) || 1, ...orders.map((o) => o.id + 1), 1),
      };
    }
  } catch (error) {
    console.warn("CampusBite local demo data could not be read.", error);
  }
  return { orders: [], menu: defaultMenu, statusLog: [], ingredients: demoIngredients, nextId: 1 };
}

function writeDatabase(db: LocalDatabase) {
  localStorage.setItem(LOCAL_DB_KEY, JSON.stringify(db));
  window.dispatchEvent(new Event("campusbite:orders-changed"));
}

function validateSupabaseConfiguration() {
  if (Boolean(supabaseUrl) !== Boolean(supabaseKey)) {
    throw new Error("Supabase configuration is incomplete. Set both VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.");
  }
}

export async function fetchMenu(): Promise<MenuItem[]> {
  validateSupabaseConfiguration();
  if (isLocalDemoMode) return readDatabase().menu.map((item) => ({ ...item }));
  const { data, error } = await getSupabase().from("menu_items").select("*").order("id");
  if (error) throw new Error(error.message);
  return (data ?? []).map((item) => ({ ...item, price: Number(item.price), rating: Number(item.rating) })) as MenuItem[];
}

export async function placeOrder(input: OrderInput): Promise<{ order_id: number; total: number }> {
  validateSupabaseConfiguration();
  if (!input.name.trim()) throw new Error("Please enter your name");
  if (!input.items.length) throw new Error("Your basket is empty");
  if (isSupabaseMode) {
    const { data, error } = await getSupabase().rpc("place_order", {
      p_name: input.name,
      p_roll: input.roll,
      p_type: input.type,
      p_items: input.items,
    });
    if (error) throw new Error(error.message);
    const result = data as { order_id: number; total: number };
    window.dispatchEvent(new Event("campusbite:orders-changed"));
    return { order_id: Number(result.order_id), total: Number(result.total) };
  }

  const db = readDatabase();
  const itemRows = input.items.map(({ id, qty }) => {
    const menuItem = db.menu.find((item) => item.id === id);
    if (!menuItem || !menuItem.available) throw new Error(`${menuItem?.name ?? "That item"} is currently unavailable`);
    if (!Number.isInteger(qty) || qty < 1 || qty > 20) throw new Error("Order quantities must be between 1 and 20");
    return { name: menuItem.name, qty, price: menuItem.price };
  });
  const subtotal = itemRows.reduce((sum, item) => sum + item.qty * item.price, 0);
  const total = Math.round(subtotal * 1.05 * 100) / 100;
  const id = db.nextId++;
  const order: CampusOrder = {
    id,
    status: "Placed",
    order_type: input.type,
    total,
    created_at: new Date().toISOString(),
    customer: input.name.trim(),
    roll_no: input.roll.trim() || undefined,
    items: itemRows,
    preparation_started_at: null,
    preparation_seconds: PREPARATION_SECONDS,
    ready_at: null,
  };
  db.orders.unshift(order);
  db.statusLog.unshift({ id: Date.now(), order_id: id, old_status: null, new_status: "Placed", changed_at: order.created_at });
  writeDatabase(db);
  return { order_id: id, total };
}

export async function getMyOrders(ids: number[]): Promise<CampusOrder[]> {
  validateSupabaseConfiguration();
  if (!ids.length) return [];
  if (isSupabaseMode) {
    const { data, error } = await getSupabase().rpc("get_orders_by_ids", { p_ids: ids });
    if (error) throw new Error(error.message);
    return ((data ?? []) as CampusOrder[]).map((order) => ({
      ...order,
      total: Number(order.total),
      items: order.items ?? [],
      preparation_seconds: Number(order.preparation_seconds ?? PREPARATION_SECONDS),
    }));
  }
  const wanted = new Set(ids);
  return readDatabase().orders.filter((order) => wanted.has(order.id)).sort((a, b) => b.id - a.id);
}

export function subscribeToOrders(callback: () => void): () => void {
  const handler = () => callback();
  const storageHandler = (event: StorageEvent) => {
    if (event.key === LOCAL_DB_KEY || event.key === "cb_orders") callback();
  };
  window.addEventListener("campusbite:orders-changed", handler);
  window.addEventListener("storage", storageHandler);
  let channel: ReturnType<SupabaseClient["channel"]> | undefined;
  if (isSupabaseMode) {
    channel = getSupabase().channel("campusbite-orders")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, handler)
      .subscribe();
  }
  return () => {
    window.removeEventListener("campusbite:orders-changed", handler);
    window.removeEventListener("storage", storageHandler);
    if (channel) void getSupabase().removeChannel(channel);
  };
}

async function withLocalQueueLock<T>(operation: () => Promise<T> | T): Promise<T | undefined> {
  const locks = (navigator as Navigator & { locks?: LockManager }).locks;
  if (!locks) {
    // Modern browsers provide Web Locks. This fallback still makes a single
    // tab the owner when simultaneous local-demo tabs start at the same time.
    const token = `${Date.now()}-${Math.random()}`;
    const leaseKey = `${QUEUE_LOCK}:lease`;
    const current = localStorage.getItem(leaseKey);
    if (current) {
      try {
        if (JSON.parse(current).expiresAt > Date.now()) return undefined;
      } catch { /* stale/corrupt lease */ }
    }
    localStorage.setItem(leaseKey, JSON.stringify({ token, expiresAt: Date.now() + 5000 }));
    if (JSON.parse(localStorage.getItem(leaseKey) ?? "{}").token !== token) return undefined;
    try {
      return await operation();
    } finally {
      if (JSON.parse(localStorage.getItem(leaseKey) ?? "{}").token === token) localStorage.removeItem(leaseKey);
    }
  }
  return locks.request(QUEUE_LOCK, { mode: "exclusive", ifAvailable: true }, async (lock) => {
    if (!lock) return undefined;
    return operation();
  });
}

function advanceLocalQueue(): { changed: boolean; readyId?: number } {
  const db = readDatabase();
  let changed = false;
  let readyId: number | undefined;
  const active = db.orders.find((order) => order.status === "Preparing");
  if (active) {
    const startedAt = active.preparation_started_at ? Date.parse(active.preparation_started_at) : Date.now();
    const duration = Math.max(1, active.preparation_seconds ?? PREPARATION_SECONDS);
    if (Date.now() >= startedAt + duration * 1000) {
      active.status = "Ready";
      active.ready_at = new Date().toISOString();
      readyId = active.id;
      db.statusLog.unshift({ id: Date.now(), order_id: active.id, old_status: "Preparing", new_status: "Ready", changed_at: active.ready_at });
      changed = true;
    }
  }
  if (!db.orders.some((order) => order.status === "Preparing")) {
    const next = db.orders.filter((order) => order.status === "Placed")
      .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at) || a.id - b.id)[0];
    if (next) {
      next.status = "Preparing";
      next.preparation_started_at = new Date().toISOString();
      next.preparation_seconds = PREPARATION_SECONDS;
      db.statusLog.unshift({ id: Date.now() + 1, order_id: next.id, old_status: "Placed", new_status: "Preparing", changed_at: next.preparation_started_at });
      changed = true;
    }
  }
  if (changed) writeDatabase(db);
  return { changed, readyId };
}

export async function runPreparationQueueTick(): Promise<number | undefined> {
  validateSupabaseConfiguration();
  if (isLocalDemoMode) {
    const result = await withLocalQueueLock(advanceLocalQueue);
    return result?.readyId;
  }

  const client = getSupabase();
  const { data: completed, error: finishError } = await client.rpc("finish_due_preparation");
  if (finishError) throw new Error(finishError.message);
  const readyId = completed == null ? undefined : Number(completed);
  const { error: claimError } = await client.rpc("claim_next_preparation_order", {
    p_duration_seconds: PREPARATION_SECONDS,
  });
  if (claimError) throw new Error(claimError.message);
  if (readyId !== undefined) window.dispatchEvent(new Event("campusbite:orders-changed"));
  return readyId;
}

export function startPreparationQueue(onError: (error: Error) => void): () => void {
  let stopped = false;
  let running = false;
  let reportedError = "";
  const tick = async () => {
    if (stopped || running) return;
    running = true;
    try {
      const readyId = await runPreparationQueueTick();
      reportedError = "";
      if (readyId !== undefined) {
        window.dispatchEvent(new CustomEvent("campusbite:order-ready", { detail: { orderId: readyId } }));
      }
    } catch (error) {
      const issue = error instanceof Error ? error : new Error("The preparation queue could not be updated.");
      if (reportedError !== issue.message) onError(issue);
      reportedError = issue.message;
    } finally {
      running = false;
    }
  };
  void tick();
  const timer = window.setInterval(() => void tick(), 1000);
  return () => {
    stopped = true;
    window.clearInterval(timer);
  };
}

async function claimNotificationLock<T>(orderId: number, operation: () => T): Promise<T> {
  const locks = (navigator as Navigator & { locks?: LockManager }).locks;
  if (locks) {
    return locks.request(`${NOTIFIED_KEY}:${orderId}`, { mode: "exclusive" }, operation);
  }
  return operation();
}

export async function notifyReadyOnce(order: CampusOrder): Promise<boolean> {
  if (order.status !== "Ready") return false;
  return claimNotificationLock(order.id, () => {
    let notified: number[] = [];
    try { notified = JSON.parse(localStorage.getItem(NOTIFIED_KEY) ?? "[]") as number[]; } catch { /* reset corrupt local record */ }
    if (notified.includes(order.id)) return false;
    localStorage.setItem(NOTIFIED_KEY, JSON.stringify([...notified, order.id]));
    window.dispatchEvent(new CustomEvent("campusbite:ready-notification", { detail: { orderId: order.id } }));
    if ("Notification" in window && Notification.permission === "granted") {
      new Notification("CampusBite order ready", {
        body: `Your CampusBite order #${order.id} is ready! Please collect it from the canteen.`,
        tag: `campusbite-order-${order.id}`,
      });
    }
    return true;
  });
}

export async function adminDashboard(pin: string) {
  validateSupabaseConfiguration();
  if (isSupabaseMode) {
    const { data, error } = await getSupabase().rpc("admin_dashboard", { p_pin: pin });
    if (error) throw new Error(error.message);
    return data;
  }
  if (pin !== "1234") throw new Error("Invalid admin PIN");
  const db = readDatabase();
  const today = new Date().toDateString();
  const todayOrders = db.orders.filter((order) => new Date(order.created_at).toDateString() === today);
  const best = new Map<string, { name: string; qty: number; revenue: number }>();
  db.orders.forEach((order) => order.items.forEach((item) => {
    const row = best.get(item.name) ?? { name: item.name, qty: 0, revenue: 0 };
    row.qty += item.qty; row.revenue += item.qty * item.price; best.set(item.name, row);
  }));
  return {
    orders: db.orders,
    menu: db.menu,
    ingredients: db.ingredients,
    log: db.statusLog.slice(0, 30),
    today: { revenue: todayOrders.reduce((sum, order) => sum + order.total, 0), orders: todayOrders.length },
    daily: [],
    best: [...best.values()].sort((a, b) => b.qty - a.qty).slice(0, 6),
  };
}

export async function adminUpdateStatus(pin: string, id: number, status: OrderStatus) {
  validateSupabaseConfiguration();
  if (!["Placed", "Preparing", "Ready", "Completed"].includes(status)) throw new Error("Invalid order status");
  if (isSupabaseMode) {
    const { error } = await getSupabase().rpc("admin_update_status", { p_pin: pin, p_order_id: id, p_status: status });
    if (error) throw new Error(error.message);
    return;
  }
  if (pin !== "1234") throw new Error("Invalid admin PIN");
  const db = readDatabase();
  const order = db.orders.find((item) => item.id === id);
  if (!order) throw new Error("Order not found");
  const oldStatus = order.status;
  order.status = status;
  if (status === "Preparing" && !order.preparation_started_at) order.preparation_started_at = new Date().toISOString();
  if (status === "Ready") order.ready_at = new Date().toISOString();
  db.statusLog.unshift({ id: Date.now(), order_id: id, old_status: oldStatus, new_status: status, changed_at: new Date().toISOString() });
  writeDatabase(db);
}

export async function adminUpsertItem(pin: string, item: MenuInput) {
  validateSupabaseConfiguration();
  if (isSupabaseMode) {
    const { error } = await getSupabase().rpc("admin_upsert_item", {
      p_pin: pin, p_id: item.id ?? null, p_name: item.name, p_desc: item.description ?? "",
      p_category: item.category, p_price: item.price, p_image: item.image_key ?? "burger",
      p_available: item.available ?? true,
    });
    if (error) throw new Error(error.message);
    return;
  }
  if (pin !== "1234") throw new Error("Invalid admin PIN");
  if (item.price <= 0) throw new Error("Price must be positive");
  const db = readDatabase();
  const existing = db.menu.find((row) => row.id === item.id);
  if (existing) Object.assign(existing, item);
  else db.menu.push({ id: Math.max(0, ...db.menu.map((row) => row.id)) + 1, rating: 4.5, image_key: "burger", available: true, ...item, description: item.description ?? "" });
  writeDatabase(db);
}

export async function adminRestock(pin: string, id: number, quantity: number) {
  validateSupabaseConfiguration();
  if (isSupabaseMode) {
    const { error } = await getSupabase().rpc("admin_restock", { p_pin: pin, p_ingredient_id: id, p_quantity: quantity });
    if (error) throw new Error(error.message);
    return;
  }
  if (pin !== "1234") throw new Error("Invalid admin PIN");
  if (quantity < 0) throw new Error("Quantity cannot be negative");
  const db = readDatabase();
  const ingredient = db.ingredients.find((row) => row.id === id);
  if (!ingredient) throw new Error("Ingredient not found");
  ingredient.quantity = quantity;
  writeDatabase(db);
}

export const demoMenu = defaultMenu;

export function getTrackedOrderIds(): number[] {
  try {
    const ids = JSON.parse(localStorage.getItem("cb_orders") ?? "[]");
    return Array.isArray(ids) ? ids.map(Number).filter(Number.isInteger) : [];
  } catch {
    return [];
  }
}
