import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Banknote,
  CalendarClock,
  Car,
  CheckCircle2,
  CircleDollarSign,
  Gauge,
  LogOut,
  MapPin,
  Navigation,
  Plus,
  ShieldCheck,
  Users
} from 'lucide-react';
import './styles.css';

type Role = 'Rider' | 'Driver';
type Trip = {
  id: string;
  driverId: string;
  startLocation: LocationInput;
  endLocation: LocationInput;
  departureTime: string;
  maxCapacity: number;
  status: string;
  baseDurationSeconds: number;
  baseDistanceMeters: number;
  acceptedFares: number;
};
type Booking = {
  id: string;
  tripId: string;
  riderName?: string;
  pickupLocation: LocationInput;
  dropoffLocation: LocationInput;
  fareAmountCents: number;
  matchStatus: string;
  checkInStatus: string;
  etaPickupTime: string;
  matchScore: number;
  detourSeconds: number;
  fareLockedAt?: string;
  stripeCheckoutUrl?: string;
};
type LocationInput = { lat: number; lng: number; label: string };
type User = {
  id: string;
  name: string;
  email: string;
  role: Role;
  authorizedRoles: Role[];
  verifiedStatus: string;
  walletBalanceCents: number;
};

const API = '';
const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const minutes = (seconds: number) => `${Math.round(seconds / 60)} min`;

function safeText(value: string) {
  return value.replace(/[<>]/g, '').slice(0, 160);
}

function useApi() {
  const [token, setToken] = useState(() => localStorage.getItem('routeshare_token') ?? '');
  const [user, setUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('routeshare_user');
    return saved ? JSON.parse(saved) : null;
  });

  function persist(nextToken: string, nextUser: User) {
    localStorage.setItem('routeshare_token', nextToken);
    localStorage.setItem('routeshare_user', JSON.stringify(nextUser));
    setToken(nextToken);
    setUser(nextUser);
  }

  async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const response = await fetch(`${API}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers ?? {})
      }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error ?? 'Request failed');
    return data;
  }

  return {
    token,
    user,
    setUser,
    async login(email: string, password: string) {
      const data = await request<{ token: string; user: User }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password })
      });
      persist(data.token, data.user);
    },
    async register(name: string, email: string, password: string, role: Role) {
      const data = await request<{ token: string; user: User }>('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({ name, email, password, role })
      });
      persist(data.token, data.user);
    },
    async switchRole(role: Role) {
      const data = await request<{ token: string; user: User }>('/api/auth/context', {
        method: 'POST',
        body: JSON.stringify({ role })
      });
      persist(data.token, data.user);
    },
    request,
    logout() {
      localStorage.removeItem('routeshare_token');
      localStorage.removeItem('routeshare_user');
      setToken('');
      setUser(null);
    }
  };
}

function AuthScreen({ api }: { api: ReturnType<typeof useApi> }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [role, setRole] = useState<Role>('Rider');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('driver@routeshare.test');
  const [password, setPassword] = useState('Password123!');
  const [error, setError] = useState('');

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    try {
      if (mode === 'login') await api.login(email, password);
      else await api.register(safeText(name), email, password, role);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-panel">
        <div className="brand-row">
          <div className="brand-mark"><Navigation size={24} /></div>
          <div>
            <h1>RouteShare</h1>
            <p>One-way carpool matching with verified fuel compensation.</p>
          </div>
        </div>
        <form onSubmit={submit} className="form-stack">
          <div className="segmented">
            <button type="button" className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}>Login</button>
            <button type="button" className={mode === 'register' ? 'active' : ''} onClick={() => setMode('register')}>Register</button>
          </div>
          {mode === 'register' && <label>Name<input value={name} onChange={(e) => setName(e.target.value)} required /></label>}
          <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
          <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
          {mode === 'register' && (
            <label>Primary role
              <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
                <option>Rider</option>
                <option>Driver</option>
              </select>
            </label>
          )}
          {error && <p className="error">{error}</p>}
          <button className="primary-btn" type="submit">{mode === 'login' ? 'Enter Dashboard' : 'Create Secure Account'}</button>
          <p className="hint">Demo users: driver@routeshare.test or rider@routeshare.test with Password123!</p>
        </form>
      </section>
      <section className="auth-map">
        <div className="route-card floating">
          <span>ETA aligned pickup</span>
          <strong>8:42 AM</strong>
        </div>
        <div className="map-line" />
        <div className="pin start"><MapPin size={18} /></div>
        <div className="pin mid"><Users size={18} /></div>
        <div className="pin end"><Car size={18} /></div>
      </section>
    </main>
  );
}

function Dashboard({ api }: { api: ReturnType<typeof useApi> }) {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [error, setError] = useState('');
  const role = api.user?.role ?? 'Rider';

  async function refresh() {
    try {
      const [tripData, bookingData] = await Promise.all([
        api.request<Trip[]>('/api/trips'),
        api.request<Booking[]>('/api/bookings')
      ]);
      setTrips(tripData);
      setBookings(bookingData);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  useEffect(() => {
    refresh();
  }, [api.token, role]);

  const pendingComp = bookings.filter((b) => b.checkInStatus === 'RiderConfirmed').reduce((sum, b) => sum + b.fareAmountCents, 0);

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand-row compact"><div className="brand-mark"><Navigation size={20} /></div><strong>RouteShare</strong></div>
        <nav>
          <a className="active"><Gauge size={18} /> Operations</a>
          <a><CalendarClock size={18} /> One-way trips</a>
          <a><ShieldCheck size={18} /> Check-ins</a>
          <a><Banknote size={18} /> Payouts</a>
        </nav>
      </aside>
      <section className="workspace">
        <header className="topbar">
          <div>
            <h2>{role} dashboard</h2>
            <p>{api.user?.verifiedStatus} account • {api.user?.email}</p>
          </div>
          <div className="top-actions">
            <select value={role} onChange={(e) => api.switchRole(e.target.value as Role).then(refresh).catch((err) => setError(err.message))}>
              {api.user?.authorizedRoles.map((item) => <option key={item}>{item}</option>)}
            </select>
            <button className="ghost-btn" onClick={api.logout}><LogOut size={16} /> Logout</button>
          </div>
        </header>
        {error && <p className="error banner">{error}</p>}
        <section className="kpi-grid">
          <Metric icon={<Car />} label="Open trips" value={String(trips.filter((t) => t.status !== 'Completed').length)} />
          <Metric icon={<Users />} label="Matched fares" value={String(bookings.filter((b) => ['Accepted', 'Paid'].includes(b.matchStatus)).length)} />
          <Metric icon={<CircleDollarSign />} label="Pending weekly compensation" value={money(api.user?.walletBalanceCents || pendingComp)} />
        </section>
        <section className="main-grid">
          <div className="map-panel">
            <div className="map-toolbar">
              <h3>Route efficiency map</h3>
              <span>One-way only</span>
            </div>
            <div className="map-canvas">
              <div className="route-path" />
              <div className="map-node node-a">Start</div>
              <div className="map-node node-b">Pickup</div>
              <div className="map-node node-c">Dropoff</div>
              <div className="map-node node-d">End</div>
            </div>
          </div>
          <div className="side-panel">
            {role === 'Driver' ? <DriverPanel api={api} refresh={refresh} trips={trips} bookings={bookings} /> : <RiderPanel api={api} refresh={refresh} trips={trips} bookings={bookings} />}
          </div>
        </section>
      </section>
    </main>
  );
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <article className="metric"><div>{icon}</div><span>{label}</span><strong>{value}</strong></article>;
}

function DriverPanel({ api, refresh, trips, bookings }: { api: ReturnType<typeof useApi>; refresh: () => Promise<void>; trips: Trip[]; bookings: Booking[] }) {
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    startLabel: 'Downtown Chicago',
    startLat: '41.8781',
    startLng: '-87.6298',
    endLabel: 'O Hare Terminal 2',
    endLat: '41.9803',
    endLng: '-87.9090',
    departureTime: new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 16),
    maxCapacity: '3'
  });

  async function createTrip(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    try {
      await api.request('/api/trips', {
        method: 'POST',
        body: JSON.stringify({
          startLocation: { label: safeText(form.startLabel), lat: Number(form.startLat), lng: Number(form.startLng) },
          endLocation: { label: safeText(form.endLabel), lat: Number(form.endLat), lng: Number(form.endLng) },
          departureTime: new Date(form.departureTime).toISOString(),
          maxCapacity: Number(form.maxCapacity)
        })
      });
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function decide(bookingId: string, decision: 'Accepted' | 'Rejected') {
    setError('');
    try {
      await api.request('/api/bookings/decision', { method: 'POST', body: JSON.stringify({ bookingId, decision }) });
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function driverCheck(bookingId: string) {
    setError('');
    try {
      await api.request(`/api/bookings/${bookingId}/driver-check-in`, { method: 'POST', body: JSON.stringify({}) });
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <>
      <h3>Driver command</h3>
      {error && <p className="error banner">{error}</p>}
      <form className="mini-form" onSubmit={createTrip}>
        <input value={form.startLabel} onChange={(e) => setForm({ ...form, startLabel: e.target.value })} />
        <input value={form.endLabel} onChange={(e) => setForm({ ...form, endLabel: e.target.value })} />
        <div className="two-col">
          <input type="datetime-local" value={form.departureTime} onChange={(e) => setForm({ ...form, departureTime: e.target.value })} />
          <input type="number" min="1" max="8" value={form.maxCapacity} onChange={(e) => setForm({ ...form, maxCapacity: e.target.value })} />
        </div>
        <button className="primary-btn"><Plus size={16} /> Publish one-way trip</button>
      </form>
      <h4>Efficient match requests</h4>
      <div className="list">
        {bookings.map((booking) => (
          <article className="fare-row" key={booking.id}>
            <div>
              <strong>{booking.riderName ?? 'Rider'} • {money(booking.fareAmountCents)}</strong>
              <span>{booking.pickupLocation.label} → {booking.dropoffLocation.label}</span>
              <small>Score {booking.matchScore} • detour {minutes(booking.detourSeconds)} • ETA {new Date(booking.etaPickupTime).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</small>
            </div>
            {booking.matchStatus === 'Pending' && <div className="row-actions"><button onClick={() => decide(booking.id, 'Accepted')}>Accept</button><button onClick={() => decide(booking.id, 'Rejected')}>Reject</button></div>}
            {booking.checkInStatus === 'RiderInitiated' && <button onClick={() => driverCheck(booking.id)}>Driver verify</button>}
            {booking.checkInStatus === 'RiderConfirmed' && <span className="status good"><CheckCircle2 size={14} /> Fare locked</span>}
          </article>
        ))}
        {bookings.length === 0 && <p className="empty">No rider requests yet.</p>}
      </div>
      <h4>Trips</h4>
      <div className="list compact-list">{trips.map((trip) => <span key={trip.id}>{trip.startLocation.label} → {trip.endLocation.label} • {trip.acceptedFares}/{trip.maxCapacity}</span>)}</div>
    </>
  );
}

function RiderPanel({ api, refresh, trips, bookings }: { api: ReturnType<typeof useApi>; refresh: () => Promise<void>; trips: Trip[]; bookings: Booking[] }) {
  const [error, setError] = useState('');
  const firstTrip = trips[0];
  const [form, setForm] = useState({
    tripId: '',
    pickupLabel: 'River North',
    pickupLat: '41.8925',
    pickupLng: '-87.6263',
    dropoffLabel: 'O Hare Kiss n Fly',
    dropoffLat: '41.9950',
    dropoffLng: '-87.8826'
  });

  const tripId = form.tripId || firstTrip?.id || '';

  async function requestFare(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    try {
      await api.request('/api/bookings', {
        method: 'POST',
        body: JSON.stringify({
          tripId,
          pickupLocation: { label: safeText(form.pickupLabel), lat: Number(form.pickupLat), lng: Number(form.pickupLng) },
          dropoffLocation: { label: safeText(form.dropoffLabel), lat: Number(form.dropoffLat), lng: Number(form.dropoffLng) }
        })
      });
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function riderAction(bookingId: string, action: 'rider-check-in' | 'rider-confirm') {
    setError('');
    try {
      await api.request(`/api/bookings/${bookingId}/${action}`, { method: 'POST', body: JSON.stringify({}) });
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <>
      <h3>Rider booking</h3>
      {error && <p className="error banner">{error}</p>}
      <form className="mini-form" onSubmit={requestFare}>
        <select value={tripId} onChange={(e) => setForm({ ...form, tripId: e.target.value })}>
          {trips.map((trip) => <option key={trip.id} value={trip.id}>{trip.startLocation.label} → {trip.endLocation.label}</option>)}
        </select>
        <input value={form.pickupLabel} onChange={(e) => setForm({ ...form, pickupLabel: e.target.value })} />
        <input value={form.dropoffLabel} onChange={(e) => setForm({ ...form, dropoffLabel: e.target.value })} />
        <button className="primary-btn" disabled={!tripId}><Plus size={16} /> Request efficient match</button>
      </form>
      <h4>My fare status</h4>
      <div className="list">
        {bookings.map((booking) => (
          <article className="fare-row" key={booking.id}>
            <div>
              <strong>{booking.matchStatus} • {money(booking.fareAmountCents)}</strong>
              <span>{booking.pickupLocation.label} → {booking.dropoffLocation.label}</span>
              <small>Check-in: {booking.checkInStatus}</small>
            </div>
            {booking.matchStatus === 'Accepted' && booking.stripeCheckoutUrl && <a className="pay-link" href={booking.stripeCheckoutUrl}>Pay fare</a>}
            {booking.matchStatus === 'Paid' && booking.checkInStatus === 'Pending' && <button onClick={() => riderAction(booking.id, 'rider-check-in')}>I entered vehicle</button>}
            {booking.checkInStatus === 'DriverChecked' && <button onClick={() => riderAction(booking.id, 'rider-confirm')}>Confirm pickup</button>}
            {booking.checkInStatus === 'RiderConfirmed' && <span className="status good"><CheckCircle2 size={14} /> Validated</span>}
          </article>
        ))}
        {bookings.length === 0 && <p className="empty">Request a slot from an open one-way trip.</p>}
      </div>
    </>
  );
}

function App() {
  const api = useApi();
  return api.user ? <Dashboard api={api} /> : <AuthScreen api={api} />;
}

createRoot(document.getElementById('root')!).render(<App />);
