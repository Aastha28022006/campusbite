import { type ReactNode, createContext, useContext, useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { QueueCoordinator } from '@/components/QueueCoordinator';
import { Toaster } from '@/components/ui/toaster';
import { Toaster as SonnerToaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import {
  adminDashboard, adminRestock, adminUpdateStatus, adminUpsertItem, fetchMenu,
  getMyOrders, isLocalDemoMode, notifyReadyOnce, placeOrder,
  PREPARATION_SECONDS, subscribeToOrders, type CampusOrder, type MenuItem,
  type OrderStatus, type OrderType,
} from '@/lib/campusbite';
import {
  ArrowRight, Bell, Check, ChefHat, ChevronRight, Clock3, Heart, LayoutDashboard,
  LoaderCircle, Minus, Plus, Search, ShoppingBag, ShoppingBasket, UtensilsCrossed,
  X, Star, PackageCheck, CircleAlert, Pencil, LockKeyhole, RotateCw,
} from 'lucide-react';
import { Link, Route, Router as WouterRouter, Switch, useLocation } from 'wouter';
import { toast } from 'sonner';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 3000 } } });
const CATEGORIES = ['All', 'Indian', 'Chinese', 'Fast Food', 'Pizza', 'Drinks', 'Desserts'];
const FOOD_IMAGE = (key: string) => `/assets/food/${key}.jpg`;
const INR = (amount: number) => `₹${Number(amount || 0).toFixed(Number(amount) % 1 ? 2 : 0)}`;
const NAV = [
  { href: '/', label: 'Menu', icon: UtensilsCrossed },
  { href: '/orders', label: 'My orders', icon: Clock3 },
  { href: '/favourites', label: 'Favourites', icon: Heart },
  { href: '/admin', label: 'Admin', icon: LayoutDashboard },
];

type Line = { item: MenuItem; qty: number };
type CartContextValue = {
  lines: Line[]; add: (item: MenuItem) => void; setQty: (id: number, qty: number) => void;
  clear: () => void; orderType: OrderType; setOrderType: (type: OrderType) => void;
  favs: number[]; toggleFav: (id: number) => void; myOrders: number[]; addMyOrder: (id: number) => void;
};
const CartContext = createContext<CartContextValue | null>(null);

function readIds(key: string): number[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(parsed) ? parsed.map(Number).filter(Number.isInteger) : [];
  } catch { return []; }
}

function CartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<Line[]>([]);
  const [favs, setFavs] = useState<number[]>(() => typeof window === 'undefined' ? [] : readIds('cb_favs'));
  const [myOrders, setMyOrders] = useState<number[]>(() => typeof window === 'undefined' ? [] : readIds('cb_orders'));
  const [orderType, setOrderType] = useState<OrderType>('Dine In');
  useEffect(() => { localStorage.setItem('cb_orders', JSON.stringify(myOrders)); }, [myOrders]);
  useEffect(() => { localStorage.setItem('cb_favs', JSON.stringify(favs)); }, [favs]);
  const value: CartContextValue = {
    lines,
    add: (item) => setLines((current) => {
      const found = current.find((line) => line.item.id === item.id);
      return found ? current.map((line) => line.item.id === item.id ? { ...line, qty: Math.min(20, line.qty + 1) } : line) : [...current, { item, qty: 1 }];
    }),
    setQty: (id, qty) => setLines((current) => qty < 1 ? current.filter((line) => line.item.id !== id) : current.map((line) => line.item.id === id ? { ...line, qty: Math.min(20, qty) } : line)),
    clear: () => setLines([]), orderType, setOrderType, favs,
    toggleFav: (id) => setFavs((current) => current.includes(id) ? current.filter((saved) => saved !== id) : [...current, id]),
    myOrders, addMyOrder: (id) => setMyOrders((current) => [id, ...current.filter((saved) => saved !== id)]),
  };
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

function useCart() {
  const context = useContext(CartContext);
  if (!context) throw new Error('Cart context is unavailable');
  return context;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <CartProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
            <QueueCoordinator />
            <AppRoutes />
          </WouterRouter>
          <Toaster />
          <SonnerToaster position="top-center" />
        </CartProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

function AppRoutes() {
  const [path] = useLocation();
  return <ErrorBoundary resetKey={path}>
    <Switch>
      <Route path="/" component={MenuPage} />
      <Route path="/orders" component={OrdersPage} />
      <Route path="/favourites" component={FavouritesPage} />
      <Route path="/admin" component={AdminPage} />
      <Route component={NotFoundPage} />
    </Switch>
  </ErrorBoundary>;
}

function Shell({ children, showBasket = true }: { children: ReactNode; showBasket?: boolean }) {
  const [path] = useLocation();
  const { lines } = useCart();
  const [basketOpen, setBasketOpen] = useState(false);
  const count = lines.reduce((total, line) => total + line.qty, 0);
  return (
    <div className="app-frame">
      <aside className="side-rail">
        <Link href="/" className="brand-mark" aria-label="CampusBite home">
          <img src="/assets/campus-bite-logo.png" alt="CampusBite" />
        </Link>
        <div className="rail-rule" />
        <nav className="rail-nav" aria-label="Primary navigation">
          {NAV.map(({ href, label, icon: Icon }) => <Link key={href} href={href} className={`rail-link ${path === href ? 'active' : ''}`} title={label} aria-label={label}>
            <Icon size={19} strokeWidth={1.8} /><span>{label}</span>
          </Link>)}
        </nav>
        <div className="rail-note"><span className="online-dot" />Canteen open<br /><small>Until 8:30 pm</small></div>
      </aside>
      <main className="main-column">
        <header className="topbar">
          <Link href="/" className="mobile-brand"><img src="/assets/campus-bite-logo.png" alt="CampusBite" /></Link>
          <span className="topbar-note">A little less waiting. A lot more lunch.</span>
          {showBasket && <button className="basket-top-button" onClick={() => setBasketOpen(true)} aria-label="Open basket">
            <ShoppingBag size={17} /><span>Basket</span>{count > 0 && <b>{count}</b>}
          </button>}
        </header>
        {isLocalDemoMode && <div className="local-banner"><CircleAlert size={15} /><span>Local mode: orders are stored in this browser only.</span></div>}
        <div className="page-content">{children}</div>
        <footer className="page-footer"><span>CampusBite</span><span>Fresh food. Campus life.</span></footer>
      </main>
      {showBasket && <Basket />}
      {showBasket && <nav className="mobile-nav" aria-label="Mobile navigation">
        {NAV.map(({ href, label, icon: Icon }) => <Link key={href} href={href} className={path === href ? 'active' : ''}>
          <Icon size={18} /><span>{label}</span>
        </Link>)}
        <button onClick={() => setBasketOpen(true)} className="mobile-basket"><ShoppingBag size={18} /><span>Basket</span>{count > 0 && <b>{count}</b>}</button>
      </nav>}
      {showBasket && basketOpen && <div className="mobile-basket-overlay" onMouseDown={(event) => event.target === event.currentTarget && setBasketOpen(false)}>
        <div className="mobile-basket-sheet"><button className="close-sheet" onClick={() => setBasketOpen(false)} aria-label="Close basket"><X size={20} /></button><BasketContent /></div>
      </div>}
    </div>
  );
}

function MenuPage() {
  const { data: menu = [], isLoading, isError, refetch } = useQuery({ queryKey: ['menu'], queryFn: fetchMenu });
  const [category, setCategory] = useState('All');
  const [search, setSearch] = useState('');
  const [greeting, setGreeting] = useState('Good afternoon');
  useEffect(() => {
    const hour = new Date().getHours();
    setGreeting(hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening');
  }, []);
  const filtered = menu.filter((item) => (category === 'All' || item.category === category) &&
    `${item.name} ${item.description} ${item.category}`.toLowerCase().includes(search.toLowerCase().trim()));
  const heroItem = menu.find((item) => item.image_key === 'burger') ?? menu[0];
  return <Shell>
    <div className="content-wrap">
      <div className="welcome-line"><span>{greeting}, hungry?</span><span className="welcome-time"><Clock3 size={14} /> Lunch, sorted.</span></div>
      <section className="hero-panel">
        <div className="hero-copy">
          <span className="eyebrow">YOUR CAMPUS CANTEEN, ON YOUR TIME</span>
          <h1>Skip the Queue,<br /><em>Savor the Food.</em></h1>
          <p>Order your canteen favourites ahead. We'll have them ready when you are.</p>
          <a href="#menu" className="hero-cta">Find your next bite <ArrowRight size={16} /></a>
          <div className="hero-footnote"><span className="hero-bullet" />One shared kitchen queue <b>·</b> 15 sec per order</div>
        </div>
        {heroItem && <div className="hero-art">
          <div className="hero-image-wrap"><img src={FOOD_IMAGE(heroItem.image_key)} alt={heroItem.name} /></div>
          <div className="hero-sticker"><Star size={13} fill="currentColor" /> A campus favourite</div>
          <div className="hero-item-label"><span>THE USUAL?</span><b>{heroItem.name}</b><strong>{INR(heroItem.price)}</strong></div>
        </div>}
        <div className="hero-decoration" aria-hidden="true">CB</div>
      </section>
      <div className="menu-toolbar" id="menu">
        <div className="section-heading"><span className="eyebrow">MADE FOR THE MIDDAY RUSH</span><h2>What sounds good?</h2></div>
        <label className="search-field"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search dishes, drinks..." aria-label="Search menu" />{search && <button onClick={() => setSearch('')} aria-label="Clear search"><X size={15} /></button>}</label>
      </div>
      <div className="category-row" role="group" aria-label="Filter menu by category">
        {CATEGORIES.map((item) => <button key={item} onClick={() => setCategory(item)} className={category === item ? 'selected' : ''}>{item}</button>)}
      </div>
      {isLoading ? <div className="food-grid">{[1, 2, 3, 4, 5, 6].map((id) => <div className="food-skeleton" key={id}><div /><span /><i /></div>)}</div>
        : isError ? <div className="state-card"><CircleAlert /><h3>Menu couldn't load</h3><p>Give it another try in a moment.</p><button className="button-primary" onClick={() => void refetch()}><RotateCw size={15} /> Try again</button></div>
          : filtered.length ? <div className="food-grid">{filtered.map((item) => <FoodCard key={item.id} item={item} />)}</div>
            : <div className="state-card empty-card"><Search /><h3>No dishes found</h3><p>Try another search or browse all categories.</p><button className="button-quiet" onClick={() => { setSearch(''); setCategory('All'); }}>Clear filters</button></div>}
      <div className="queue-note"><span className="queue-icon"><ChefHat size={19} /></span><div><b>One kitchen. Orders in order.</b><p>Every order moves through the same 15-second prep queue. No cutting ahead.</p></div><span className="queue-duration">15<small>SEC</small></span></div>
    </div>
  </Shell>;
}

function FoodCard({ item }: { item: MenuItem }) {
  const { add, favs, toggleFav } = useCart();
  const saved = favs.includes(item.id);
  return <article className={`food-card ${!item.available ? 'unavailable' : ''}`} data-testid={`card-menu-item-${item.id}`}>
    <div className="food-image"><img loading="lazy" src={FOOD_IMAGE(item.image_key)} alt={item.name} />
      <button className={`fav-button ${saved ? 'saved' : ''}`} onClick={() => toggleFav(item.id)} aria-label={saved ? `Remove ${item.name} from favourites` : `Save ${item.name} to favourites`}><Heart size={17} fill={saved ? 'currentColor' : 'none'} /></button>
      {!item.available && <span className="sold-out">Sold out</span>}
      <span className="food-category">{item.category}</span>
    </div>
    <div className="food-info">
      <div className="food-title-row"><h3>{item.name}</h3><span className="rating"><Star size={12} fill="currentColor" />{Number(item.rating).toFixed(1)}</span></div>
      <p>{item.description}</p>
      <div className="food-action-row"><strong>{INR(item.price)}</strong><button disabled={!item.available} onClick={() => { add(item); toast.success(`${item.name} added to basket`); }} className="add-button">
        <Plus size={15} /> {item.available ? 'Add' : 'Unavailable'}
      </button></div>
    </div>
  </article>;
}

function Basket() {
  return <aside className="basket-desktop"><BasketContent /></aside>;
}

function BasketContent() {
  const { lines, setQty, clear, orderType, setOrderType, addMyOrder } = useCart();
  const [name, setName] = useState('');
  const [roll, setRoll] = useState('');
  const [busy, setBusy] = useState(false);
  const [placed, setPlaced] = useState<{ order_id: number; total: number } | null>(null);
  const [receipt, setReceipt] = useState<{ order_id: number; total: number } | null>(null);
  const qc = useQueryClient();
  const subtotal = lines.reduce((sum, line) => sum + line.item.price * line.qty, 0);
  const tax = Math.round(subtotal * 5) / 100;
  const submit = async () => {
    if (!name.trim()) { toast.error('Please enter your name'); return; }
    if (!lines.length) return;
    setBusy(true);
    try {
      const result = await placeOrder({ name, roll, type: orderType, items: lines.map(({ item, qty }) => ({ id: item.id, qty })) });
      addMyOrder(result.order_id);
      setReceipt(result);
      setPlaced(result);
      clear();
      void qc.invalidateQueries({ queryKey: ['my-orders'] });
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Could not place order'); }
    finally { setBusy(false); }
  };
  return <div className="basket-content">
    <div className="basket-heading"><span className="basket-icon"><ShoppingBasket size={18} /></span><div><span className="eyebrow">YOUR ORDER</span><h2>Your basket <small>{lines.length ? `${lines.reduce((sum, line) => sum + line.qty, 0)} items` : ''}</small></h2></div></div>
    <div className="order-type-selector">{(['Dine In', 'Pick Up', 'Delivery'] as OrderType[]).map((type) => <button key={type} onClick={() => setOrderType(type)} className={orderType === type ? 'selected' : ''}>{type}</button>)}</div>
    {!lines.length ? <div className="basket-empty"><div className="empty-basket-icon"><ShoppingBag size={21} /></div><b>A good meal starts here.</b><p>Add something from the menu to begin.</p></div> : <>
      <div className="basket-lines">{lines.map(({ item, qty }) => <div className="basket-line" key={item.id}>
        <img src={FOOD_IMAGE(item.image_key)} alt="" /><div className="line-detail"><b>{item.name}</b><span>{INR(item.price * qty)}</span></div>
        <div className="qty-control"><button onClick={() => setQty(item.id, qty - 1)} aria-label={`Remove one ${item.name}`}><Minus size={12} /></button><span>{qty}</span><button onClick={() => setQty(item.id, qty + 1)} aria-label={`Add one ${item.name}`}><Plus size={12} /></button></div>
      </div>)}</div>
      <div className="checkout-fields"><label>Your name<input value={name} onChange={(event) => setName(event.target.value)} placeholder="Name for your order" /></label><label>Roll number <span>optional</span><input value={roll} onChange={(event) => setRoll(event.target.value)} placeholder="e.g. 24CS108" /></label></div>
      <div className="bill-lines"><div><span>Subtotal</span><b>{INR(subtotal)}</b></div><div><span>GST (5%)</span><b>{INR(tax)}</b></div><div className="bill-total"><span>Total</span><b>{INR(subtotal + tax)}</b></div></div>
      <button className="place-order-button" onClick={() => void submit()} disabled={busy}>{busy ? <><LoaderCircle className="spin" size={17} /> Placing order...</> : <>Place order <ArrowRight size={16} /></>}</button>
      <p className="checkout-footnote"><LockKeyhole size={12} /> No payment needed at checkout</p>
    </>}
    {placed && <div className="order-success-backdrop"><div className="order-success-card"><button className="success-close" onClick={() => setPlaced(null)} aria-label="Close confirmation"><X size={18} /></button><span className="success-check"><Check size={24} /></span><span className="eyebrow">YOU'RE ALL SET</span><h2>Order placed.</h2><p>Your kitchen spot is in line.</p><span className="receipt-number">#{placed.order_id}</span><div className="receipt-total">Total <b>{INR(placed.total)}</b></div><Link href="/orders" className="button-primary" onClick={() => setPlaced(null)}>Track your order <ArrowRight size={15} /></Link></div></div>}
    {receipt && <span className="sr-only" aria-live="polite">Order {receipt.order_id} placed</span>}
  </div>;
}

function FavouritesPage() {
  const { data: menu = [], isLoading, isError, refetch } = useQuery({ queryKey: ['menu'], queryFn: fetchMenu });
  const { favs } = useCart();
  const items = menu.filter((item) => favs.includes(item.id));
  return <Shell><div className="content-wrap subpage">
    <PageIntro eyebrow="THE ONES YOU COME BACK TO" title="Favourites" description="Your saved canteen classics, all in one place." />
    {isLoading ? <div className="food-grid">{[1, 2, 3].map((id) => <div className="food-skeleton" key={id}><div /><span /><i /></div>)}</div>
      : isError ? <div className="state-card"><CircleAlert /><h3>Couldn't load your saved dishes</h3><button className="button-primary" onClick={() => void refetch()}>Try again</button></div>
        : items.length ? <div className="food-grid">{items.map((item) => <FoodCard key={item.id} item={item} />)}</div>
          : <div className="state-card empty-card"><span className="empty-heart"><Heart size={23} /></span><h3>Keep your favourites close.</h3><p>Tap the heart on any dish and it will be waiting here.</p><Link href="/" className="button-primary">Browse the menu <ArrowRight size={15} /></Link></div>}
  </div></Shell>;
}

function OrdersPage() {
  const { myOrders } = useCart();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['my-orders', myOrders],
    queryFn: () => getMyOrders(myOrders),
    enabled: myOrders.length > 0,
    refetchInterval: 1500,
  });
  const [, setNow] = useState(Date.now());
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 500); return () => window.clearInterval(timer); }, []);
  useEffect(() => {
    const unsubscribe = subscribeToOrders(() => { void queryClient.invalidateQueries({ queryKey: ['my-orders'] }); });
    return unsubscribe;
  }, []);
  const canNotify = typeof window !== 'undefined' && 'Notification' in window;
  const enableNotifications = async () => {
    if (!canNotify) return;
    try {
      const permission = await Notification.requestPermission();
      toast[permission === 'granted' ? 'success' : 'message'](permission === 'granted' ? 'Notifications enabled' : 'Notifications were not enabled');
      if (permission === 'granted') {
        for (const order of data ?? []) if (order.status === 'Ready') await notifyReadyOnce(order);
      }
    } catch { toast.error('Notifications are not available in this browser'); }
  };
  return <Shell><div className="content-wrap subpage">
    <div className="orders-title-row"><PageIntro eyebrow="FROM THE KITCHEN, IN REAL TIME" title="My orders" description="Your place in line, from placed to ready." />
      {canNotify && <button className="notify-button" onClick={() => void enableNotifications()}><Bell size={15} /> Enable notifications</button>}
    </div>
    {myOrders.length === 0 ? <div className="state-card empty-card"><span className="empty-order-icon"><ShoppingBag size={23} /></span><h3>Nothing on the pass yet.</h3><p>When you place an order, its progress will show up here.</p><Link href="/" className="button-primary">Explore the menu <ArrowRight size={15} /></Link></div>
      : isLoading ? <OrderSkeleton />
        : isError ? <div className="state-card"><CircleAlert /><h3>Orders aren't updating</h3><p>Check your connection, then refresh the order list.</p><button className="button-primary" onClick={() => void refetch()}><RotateCw size={15} /> Refresh orders</button></div>
          : <div className="orders-list">{(data ?? []).map((order) => <OrderCard key={order.id} order={order} />)}</div>}
  </div></Shell>;
}

function OrderCard({ order }: { order: CampusOrder }) {
  const current = order.status === 'Completed' ? 3 : ['Placed', 'Preparing', 'Ready'].indexOf(order.status);
  const started = order.preparation_started_at ? Date.parse(order.preparation_started_at) : 0;
  const remaining = order.status === 'Preparing' && started ? Math.max(0, Math.ceil(((started + (order.preparation_seconds ?? PREPARATION_SECONDS) * 1000) - Date.now()) / 1000)) : 0;
  const progress = order.status === 'Preparing' ? Math.max(8, Math.min(100, ((order.preparation_seconds ?? PREPARATION_SECONDS) - remaining) / (order.preparation_seconds ?? PREPARATION_SECONDS) * 100)) : order.status === 'Ready' || order.status === 'Completed' ? 100 : 0;
  return <article className={`order-card status-${order.status.toLowerCase()}`}>
    <div className="order-card-top"><div><span className="eyebrow">ORDER RECEIPT</span><h3>#{order.id}</h3><p>{new Date(order.created_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })} <span>·</span> {order.order_type}</p></div>
      <div className="order-status-price"><StatusBadge status={order.status} /><b>{INR(order.total)}</b></div>
    </div>
    <p className="order-items">{(order.items ?? []).map((item) => `${item.qty} × ${item.name}`).join('  ·  ')}</p>
    <div className="progress-track" aria-label={`Order status ${order.status}`}>
      {(['Placed', 'Preparing', 'Ready'] as const).map((status, index) => <div key={status} className={`progress-step ${index <= current ? 'done' : ''} ${order.status === status ? 'current' : ''}`}>
        <span className="progress-dot">{index < current || current === 3 ? <Check size={12} /> : index + 1}</span><span>{status}</span>
      </div>)}
      <div className="progress-line"><i style={{ width: `${progress}%` }} /></div>
    </div>
    <div className="order-bottom-note">
      {order.status === 'Placed' && <><Clock3 size={15} /><span>Placed in the kitchen queue. We'll start shortly.</span></>}
      {order.status === 'Preparing' && <><ChefHat size={15} /><span>Cooking now <b className="countdown">{String(Math.floor(remaining / 60)).padStart(2, '0')}:{String(remaining % 60).padStart(2, '0')}</b> remaining</span></>}
      {order.status === 'Ready' && <><PackageCheck size={16} /><span>Your food is ready for collection.</span><span className="ready-badge">READY</span></>}
      {order.status === 'Completed' && <><Check size={15} /><span>Collected. Thanks for stopping by.</span></>}
    </div>
  </article>;
}

function StatusBadge({ status }: { status: OrderStatus }) {
  return <span className={`status-badge badge-${status.toLowerCase()}`}><i />{status}</span>;
}

function OrderSkeleton() {
  return <div className="orders-list">{[1, 2].map((id) => <div className="order-skeleton" key={id}><span /><i /><b /></div>)}</div>;
}

function AdminPage() {
  const [pin, setPin] = useState('');
  const [acceptedPin, setAcceptedPin] = useState('');
  const [tab, setTab] = useState<'Orders' | 'Menu' | 'Inventory' | 'Reports'>('Orders');
  const [authError, setAuthError] = useState('');
  const qc = useQueryClient();
  const { data, error, isLoading, refetch } = useQuery({
    queryKey: ['admin', acceptedPin], queryFn: () => adminDashboard(acceptedPin) as Promise<any>,
    enabled: Boolean(acceptedPin), refetchInterval: 12000,
  });
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['admin', acceptedPin] }); void qc.invalidateQueries({ queryKey: ['menu'] }); };
  const act = async (fn: () => Promise<unknown>, message: string) => {
    try { await fn(); toast.success(message); refresh(); }
    catch (err) { toast.error(err instanceof Error ? err.message : 'Action could not be completed'); }
  };
  const submitPin = () => { setAuthError(''); setAcceptedPin(pin); };
  if (!acceptedPin || error) return <Shell showBasket={false}><div className="admin-gate">
    <div className="gate-symbol"><LockKeyhole size={22} /></div><span className="eyebrow">CAMPUS CANTEEN</span><h1>Admin access</h1>
    <p>Sign in to manage orders, menu availability and stock.</p>
    {(authError || error) && <div className="admin-error"><CircleAlert size={15} />{authError || (error instanceof Error ? error.message : 'Access denied')}</div>}
    <form onSubmit={(event) => { event.preventDefault(); submitPin(); }}><label>Admin PIN<input autoComplete="current-password" type="password" value={pin} onChange={(event) => setPin(event.target.value)} placeholder="Enter your PIN" /></label><button className="button-primary" type="submit">Open dashboard <ArrowRight size={15} /></button></form>
    {isLocalDemoMode && <small className="demo-pin-note">Local demo PIN: <b>1234</b></small>}
  </div></Shell>;
  if (isLoading || !data) return <Shell showBasket={false}><div className="content-wrap"><div className="dashboard-loading"><div /><div /><div /></div></div></Shell>;
  const tabs = ['Orders', 'Menu', 'Inventory', 'Reports'] as const;
  return <Shell showBasket={false}><div className="content-wrap admin-content">
    <div className="admin-header"><div><span className="eyebrow">CANTEEN OPERATIONS</span><h1>Dashboard</h1><p>Keep the kitchen and counter moving.</p></div><button className="refresh-button" onClick={() => void refetch()}><RotateCw size={15} /> Refresh</button></div>
    <div className="admin-tabs" role="tablist">{tabs.map((item) => <button key={item} onClick={() => setTab(item)} className={tab === item ? 'selected' : ''}>{item}{item === 'Orders' && Array.isArray(data.orders) && data.orders.length > 0 && <span>{data.orders.length}</span>}</button>)}</div>
    {tab === 'Orders' && <AdminOrders data={data} pin={acceptedPin} act={act} />}
    {tab === 'Menu' && <AdminMenu items={data.menu ?? []} onSave={(item) => act(() => adminUpsertItem(acceptedPin, item), 'Menu item saved')} />}
    {tab === 'Inventory' && <AdminInventory items={data.ingredients ?? []} onSave={(id, quantity, name) => act(() => adminRestock(acceptedPin, id, quantity), `${name} stock updated`)} />}
    {tab === 'Reports' && <AdminReports data={data} />}
  </div></Shell>;
}

function AdminOrders({ data, pin, act }: { data: any; pin: string; act: (fn: () => Promise<unknown>, message: string) => void }) {
  const orders = data.orders ?? [];
  return <div className="admin-orders-pane">
    <div className="admin-section-head"><div><h2>Order queue</h2><p>Orders from newest to oldest.</p></div><span className="live-label"><i /> LIVE</span></div>
    {!orders.length ? <div className="admin-empty">No orders have come in yet.</div> : orders.map((order: CampusOrder) => <div className="admin-order-row" key={order.id}>
      <div className="admin-order-meta"><b>#{order.id} <span>· {order.customer}</span></b><small>{order.roll_no || 'No roll number'} · {order.order_type}</small><p>{(order.items ?? []).map((item) => `${item.qty} × ${item.name}`).join(', ')}</p></div>
      <b className="admin-order-price">{INR(order.total)}</b><StatusBadge status={order.status} />
      <select aria-label={`Update order ${order.id} status`} value={order.status} onChange={(event) => act(() => adminUpdateStatus(pin, order.id, event.target.value as OrderStatus), `Order #${order.id} updated`)}>{['Placed', 'Preparing', 'Ready', 'Completed'].map((status) => <option key={status}>{status}</option>)}</select>
    </div>)}
    <div className="admin-log"><h3>Status change log</h3>{(data.log ?? []).length ? data.log.map((entry: any) => <p key={entry.id}>{new Date(entry.changed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}<span>Order #{entry.order_id}</span><b>{entry.old_status ?? 'New'} <ChevronRight size={12} /> {entry.new_status}</b></p>) : <small>No status changes recorded yet.</small>}</div>
  </div>;
}

function AdminMenu({ items, onSave }: { items: MenuItem[]; onSave: (item: any) => void }) {
  const blank = { name: '', description: '', category: 'Indian', price: 50, image_key: 'burger', available: true };
  const [edit, setEdit] = useState<any>(blank);
  const imageKeys = ['burger', 'noodles', 'manchurian', 'friedrice', 'momos', 'pizza', 'thali', 'coffee', 'gulabjamun', 'chai', 'lassi', 'limesoda', 'shake'];
  return <div className="menu-admin-grid"><section className="admin-table-card"><div className="admin-section-head"><div><h2>Menu items</h2><p>Control what's available to order.</p></div><span>{items.length} dishes</span></div>
    {items.map((item) => <div className="menu-admin-row" key={item.id}><img src={FOOD_IMAGE(item.image_key)} alt="" /><div><b>{item.name}</b><small>{item.category}</small></div><strong>{INR(item.price)}</strong><button className={`availability-pill ${item.available ? 'is-available' : ''}`} onClick={() => onSave({ ...item, available: !item.available })}>{item.available ? 'Available' : 'Sold out'}</button><button className="edit-item" onClick={() => setEdit({ ...item })}><Pencil size={14} /> Edit</button></div>)}
    {!items.length && <div className="admin-empty">No menu items are available.</div>}
  </section><form className="menu-edit-form" onSubmit={(event) => { event.preventDefault(); if (!edit.name.trim()) { toast.error('A dish name is required'); return; } onSave({ ...edit, price: Number(edit.price) }); setEdit(blank); }}>
    <span className="eyebrow">{edit.id ? 'UPDATE A DISH' : 'GROW THE MENU'}</span><h3>{edit.id ? 'Edit menu item' : 'Add a dish'}</h3>
    <label>Dish name<input required value={edit.name} onChange={(event) => setEdit({ ...edit, name: event.target.value })} placeholder="e.g. Aloo paratha" /></label>
    <label>Description<input value={edit.description ?? ''} onChange={(event) => setEdit({ ...edit, description: event.target.value })} placeholder="Short, appetising description" /></label>
    <div className="form-pair"><label>Category<select value={edit.category} onChange={(event) => setEdit({ ...edit, category: event.target.value })}>{CATEGORIES.slice(1).map((category) => <option key={category}>{category}</option>)}</select></label><label>Price<input type="number" min="1" value={edit.price} onChange={(event) => setEdit({ ...edit, price: Number(event.target.value) })} /></label></div>
    <label>Photo<select value={edit.image_key} onChange={(event) => setEdit({ ...edit, image_key: event.target.value })}>{imageKeys.map((key) => <option key={key}>{key}</option>)}</select></label>
    <button type="submit" className="button-primary">{edit.id ? 'Save changes' : 'Add to menu'} <ArrowRight size={15} /></button>{edit.id && <button type="button" className="cancel-edit" onClick={() => setEdit(blank)}>Cancel editing</button>}
  </form></div>;
}

function AdminInventory({ items, onSave }: { items: any[]; onSave: (id: number, quantity: number, name: string) => void }) {
  return <div className="inventory-card"><div className="admin-section-head"><div><h2>Inventory</h2><p>Keep an eye on canteen essentials.</p></div><span>{items.length} tracked items</span></div>
    {items.length ? items.map((item) => <InventoryRow key={item.id} item={item} onSave={(qty) => onSave(item.id, qty, item.name)} />) : <div className="admin-empty inventory-empty"><PackageCheck size={22} /><b>No inventory items to track yet.</b><span>Inventory records will appear here when configured for this canteen.</span></div>}
  </div>;
}

function InventoryRow({ item, onSave }: { item: any; onSave: (qty: number) => void }) {
  const [quantity, setQuantity] = useState(String(item.quantity));
  const low = Number(item.quantity) <= Number(item.low_threshold);
  return <div className="inventory-row"><div><b>{item.name}</b><small>{Number(item.quantity)} {item.unit} on hand</small></div>{low && <span className="low-stock">Low stock</span>}<input type="number" min="0" value={quantity} onChange={(event) => setQuantity(event.target.value)} aria-label={`Set ${item.name} quantity`} /><button onClick={() => onSave(Number(quantity))}>Update stock</button></div>;
}

function AdminReports({ data }: { data: any }) {
  const best = data.best ?? [];
  const max = Math.max(1, ...best.map((item: any) => Number(item.qty)));
  return <div className="reports-grid"><div className="report-stat"><span className="eyebrow">TODAY'S REVENUE</span><strong>{INR(Number(data.today?.revenue ?? 0))}</strong><small>Across {data.today?.orders ?? 0} orders</small></div><div className="report-stat orange-stat"><span className="eyebrow">ORDERS TODAY</span><strong>{data.today?.orders ?? 0}</strong><small>Every order goes through one queue</small></div>
    <section className="report-panel"><div className="admin-section-head"><div><h2>Best-selling dishes</h2><p>By quantity ordered.</p></div></div>{best.map((item: any) => <div className="best-row" key={item.name}><div><b>{item.name}</b><span>{item.qty} sold · {INR(Number(item.revenue))}</span></div><div className="best-bar"><i style={{ width: `${Number(item.qty) / max * 100}%` }} /></div></div>)}{!best.length && <div className="admin-empty">Sales will show here once orders come in.</div>}</section>
    <section className="report-panel"><div className="admin-section-head"><div><h2>Last 7 days</h2><p>Daily canteen totals.</p></div></div>{(data.daily ?? []).length ? (data.daily ?? []).map((day: any) => <div className="daily-row" key={day.day}><span>{day.day}</span><b>{day.orders} orders</b><strong>{INR(Number(day.revenue))}</strong></div>) : <div className="admin-empty">Daily history will appear as sales come in.</div>}</section>
  </div>;
}

function PageIntro({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return <div className="page-intro"><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>;
}

function NotFoundPage() {
  return <Shell showBasket={false}><div className="state-card empty-card not-found"><span className="eyebrow">404 · WRONG TURN</span><h1>Nothing on this plate.</h1><p>That page isn't on today's menu.</p><Link href="/" className="button-primary">Back to the menu <ArrowRight size={15} /></Link></div></Shell>;
}

export default App;
