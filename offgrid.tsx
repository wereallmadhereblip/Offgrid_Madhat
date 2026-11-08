import React, { useEffect, useState } from 'react';
import { BookOpen, Brain, Check, Clapperboard, Download, ExternalLink, GraduationCap, LockKeyhole, Map, NotebookPen, Radio, RefreshCw, Settings, Shield, Sparkles, Wrench, X } from 'lucide-react';
import './style.css';
import './admin.css';

const services = [
  { id: 'library', title: 'Information Library', poweredBy: 'Kiwix', description: 'Offline access to Wikipedia, reference books, and practical guides.', icon: BookOpen, url: 'http://localhost:8081' },
  { id: 'education', title: 'Education Platform', poweredBy: 'Kolibri', description: 'Courses, lessons, and learning resources for all ages.', icon: GraduationCap, url: 'http://localhost:8082' },
  { id: 'ai', title: 'AI Assistant', poweredBy: 'Open WebUI + Ollama', description: 'Chat with a local AI model running on your own hardware.', icon: Brain, url: 'http://localhost:8080' },
  { id: 'maps', title: 'Offline Maps', poweredBy: 'Your map server', description: 'Explore your downloaded maps and geographic resources.', icon: Map, url: 'http://localhost:8084' },
  { id: 'tools', title: 'Data Tools', poweredBy: 'CyberChef', description: 'Encode, decode, analyze, and work with data locally.', icon: Wrench, url: 'http://localhost:8083' },
  { id: 'media', title: 'Media Library', poweredBy: 'Jellyfin', description: 'Stream your own movies, shows, music, and photos from local storage.', icon: Clapperboard, url: 'http://localhost:8096' },
  { id: 'notes', title: 'Notes', poweredBy: 'Your notes app', description: 'Keep useful information and field notes close at hand.', icon: NotebookPen, url: 'http://localhost:8085' },
  { id: 'comms', title: 'Mesh Communications', poweredBy: 'Meshtastic Web', description: 'Connect to a compatible Meshtastic radio using its browser client.', icon: Radio, url: 'http://localhost:8450' },
];

type Addresses = Record<string, string>;
type UpdateResult = { installed: string | null; latest: string | null; updateAvailable: boolean; releaseUrl: string; status: string };
type UpdateReport = { checkedAt: string | null; results: Record<string, UpdateResult> };

const tokenKey = 'offgrid-madhat-admin-token';

async function api<T>(path: string, options: { method?: string; token?: string | null; body?: unknown } = {}): Promise<T> {
  const response = await fetch(path, {
    method: options.method || 'GET',
    headers: {
      ...(options.body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(data.error || 'Request failed.'), { status: response.status });
  return data as T;
}

function validAddress(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export default function CommandCenter() {
  const [addresses, setAddresses] = useState<Addresses>({});
  const [draft, setDraft] = useState<Addresses>({});
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState('');
  const [token, setToken] = useState<string | null>(() => sessionStorage.getItem(tokenKey));
  const [loginOpen, setLoginOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [updates, setUpdates] = useState<UpdateReport | null>(null);
  const [checking, setChecking] = useState(false);
  const [usingDefault, setUsingDefault] = useState(false);
  const [pwCurrent, setPwCurrent] = useState('');
  const [pwNext, setPwNext] = useState('');
  const [pwConfirm, setPwConfirm] = useState('');
  const [pwMessage, setPwMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const admin = token !== null;

  function endSession() {
    sessionStorage.removeItem(tokenKey);
    setToken(null);
    setUpdates(null);
    setEditing(false);
    setUsingDefault(false);
  }

  useEffect(() => {
    api<Addresses>('/api/services').then(setAddresses).catch(() => setAddresses({}));
  }, []);

  useEffect(() => {
    if (!token) return;
    let active = true;
    const load = () => api<UpdateReport>('/api/updates', { token })
      .then(report => active && setUpdates(report))
      .catch(failure => {
        if ((failure as { status?: number }).status === 401) endSession();
      });
    load();
    const timer = setInterval(load, 10 * 60 * 1000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [token]);

  function openSettings() {
    setDraft(Object.fromEntries(services.map(service => [service.id, addresses[service.id] || service.url])));
    setError('');
    setPwCurrent('');
    setPwNext('');
    setPwConfirm('');
    setPwMessage(null);
    if (admin) {
      setEditing(true);
      return;
    }
    setPassword('');
    setAuthError('');
    setLoginOpen(true);
  }

  async function login(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthError('');
    setAuthBusy(true);
    try {
      const { token: issued, defaultPassword } = await api<{ token: string; defaultPassword: boolean }>('/api/login', { method: 'POST', body: { password } });
      sessionStorage.setItem(tokenKey, issued);
      setToken(issued);
      setUsingDefault(defaultPassword);
      setLoginOpen(false);
      setPassword('');
      setEditing(true);
    } catch (failure) {
      setAuthError(failure instanceof Error ? failure.message : 'Could not reach the Offgrid Madhat server.');
    } finally {
      setAuthBusy(false);
    }
  }

  async function lock() {
    const current = token;
    endSession();
    if (current) await api('/api/logout', { method: 'POST', token: current }).catch(() => undefined);
  }

  async function saveSettings(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleaned = Object.fromEntries(services.map(service => [service.id, (draft[service.id] || '').trim()]));
    if (Object.values(cleaned).some(value => !validAddress(value))) {
      setError('Enter a complete HTTP or HTTPS address for every service.');
      return;
    }
    try {
      setAddresses(await api<Addresses>('/api/services', { method: 'PUT', token, body: cleaned }));
      setEditing(false);
    } catch (failure) {
      if ((failure as { status?: number }).status === 401) {
        endSession();
        setAuthError('Your admin session expired. Log in again.');
        setLoginOpen(true);
        return;
      }
      setError(failure instanceof Error ? failure.message : 'Could not save settings.');
    }
  }

  async function changePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pwNext !== pwConfirm) {
      setPwMessage({ ok: false, text: 'The new passwords do not match.' });
      return;
    }
    try {
      await api('/api/password', { method: 'PUT', token, body: { current: pwCurrent, next: pwNext } });
      setPwCurrent('');
      setPwNext('');
      setPwConfirm('');
      setUsingDefault(false);
      setPwMessage({ ok: true, text: 'Admin password changed.' });
    } catch (failure) {
      if ((failure as { status?: number }).status === 401 && !(failure instanceof Error && /Current/.test(failure.message))) {
        endSession();
        setAuthError('Your admin session expired. Log in again.');
        setLoginOpen(true);
        return;
      }
      setPwMessage({ ok: false, text: failure instanceof Error ? failure.message : 'Could not change the password.' });
    }
  }

  async function checkNow() {
    setChecking(true);
    try {
      setUpdates(await api<UpdateReport>('/api/updates/check', { method: 'POST', token }));
    } catch (failure) {
      if ((failure as { status?: number }).status === 401) endSession();
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-inner">
          <a className="brand" href="#home" aria-label="Offgrid Madhat home"><Shield size={22} strokeWidth={1.8} /><span>OFFGRID <strong>MADHAT</strong></span></a>
          <div className="topbar-right"><span className="local-label"><span className="status-dot" /> LOCAL COMMAND CENTER</span><button className="settings-button" onClick={admin ? lock : openSettings} title={admin ? 'Lock admin' : 'Admin settings'} aria-label={admin ? 'Lock admin' : 'Admin settings'}>{admin ? <LockKeyhole size={19} /> : <Settings size={19} />}</button></div>
        </div>
      </header>
      <main id="home" className="main-content">
        <div className="heading">
          <div className="emblem"><Shield size={34} strokeWidth={1.4} /><Sparkles className="emblem-spark" size={14} /></div>
          <div className="eyebrow">YOUR OFFLINE TOOLKIT</div>
          <h1>Command Center</h1>
          <p>Knowledge, tools, and resources. All in one place.</p>
        </div>
        <div className="section-heading"><div><span className="section-kicker">YOUR RESOURCES</span><h2>Explore your toolkit</h2></div>
          <div className="admin-actions">
            {admin && <button className="text-button" onClick={checkNow} disabled={checking} title={updates?.checkedAt ? `Last checked ${new Date(updates.checkedAt).toLocaleString()}` : 'Not checked yet'}><RefreshCw size={15} /> {checking ? 'Checking…' : 'Check for updates'}</button>}
            <button className="text-button" onClick={openSettings}><Settings size={15} /> Configure services</button>
          </div>
        </div>
        <div className="service-grid">
          {services.map(service => {
            const Icon = service.icon;
            const configured = addresses[service.id];
            const address = configured && validAddress(configured) ? configured : service.url;
            const update = admin ? updates?.results[service.id] : undefined;
            return <div className="tile-wrap" key={service.id}>
              <a className="service-tile" href={address} target="_blank" rel="noopener noreferrer">
                <span className="tile-arrow"><ExternalLink size={16} /></span>
                <span className="tile-icon"><Icon size={28} strokeWidth={1.6} /></span>
                <h3>{service.title}</h3>
                <span className="powered-by">{service.poweredBy}</span>
                <p>{service.description}</p>
                <span className="tile-action">OPEN SERVICE <span aria-hidden="true">&rarr;</span></span>
              </a>
              {update?.updateAvailable && <a className="update-button" href={update.releaseUrl} target="_blank" rel="noopener noreferrer"><Download size={15} /> Update available: {update.installed} &rarr; {update.latest}</a>}
            </div>;
          })}
          <button className="service-tile setup-tile" onClick={openSettings}>
            <span className="tile-icon"><Settings size={28} strokeWidth={1.6} /></span>
            <h3>Service Settings</h3>
            <span className="powered-by">MAKE IT YOURS</span>
            <p>Connect the tools you have installed by setting their local addresses.</p>
            <span className="tile-action">CONFIGURE <span aria-hidden="true">&rarr;</span></span>
          </button>
        </div>
        <div className="notice"><span className="notice-icon"><Shield size={17} /></span><p><strong>Built for your own infrastructure.</strong> Services and offline content are installed separately. Admins are told about available updates for supported apps only; the dashboard does not install them.</p></div>
      </main>
      <footer><span>OFFGRID MADHAT</span><span>YOUR KNOWLEDGE. YOUR HARDWARE.</span></footer>
      {loginOpen && <div className="modal-backdrop" onClick={() => setLoginOpen(false)}>
        <section className="modal auth-modal" role="dialog" aria-modal="true" aria-labelledby="admin-title" onClick={event => event.stopPropagation()}>
          <div className="modal-header"><div><span className="section-kicker">ADMIN ACCESS</span><h2 id="admin-title">Admin login</h2></div><button className="icon-button" onClick={() => setLoginOpen(false)} aria-label="Close admin login" title="Close"><X size={20} /></button></div>
          <p className="modal-description">Enter the admin password to change service settings and see update notices.</p>
          <form onSubmit={login}>
            <div className="auth-fields"><label><span>Admin password</span><input type="password" required autoComplete="current-password" autoFocus value={password} onChange={event => setPassword(event.target.value)} /></label></div>
            {authError && <p className="form-error" role="alert">{authError}</p>}
            <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setLoginOpen(false)}>Cancel</button><button type="submit" className="primary-button" disabled={authBusy}><LockKeyhole size={16} /> {authBusy ? 'Checking…' : 'Log in'}</button></div>
          </form>
        </section>
      </div>}
      {editing && <div className="modal-backdrop" onClick={() => setEditing(false)}>
        <section className="modal" role="dialog" aria-modal="true" aria-labelledby="settings-title" onClick={event => event.stopPropagation()}>
          <div className="modal-header"><div><span className="section-kicker">YOUR TOOLKIT</span><h2 id="settings-title">Service settings</h2></div><button className="icon-button" onClick={() => setEditing(false)} aria-label="Close settings" title="Close"><X size={20} /></button></div>
          <p className="modal-description">Enter the address of each service. These settings are saved on the server and shared with everyone using this dashboard.</p>
          <form onSubmit={saveSettings}>
            <div className="form-fields">{services.map(service => <label key={service.id}><span>{service.title}</span><input type="url" required value={draft[service.id] || ''} onChange={event => setDraft({ ...draft, [service.id]: event.target.value })} /></label>)}</div>
            {error && <p className="form-error" role="alert">{error}</p>}
            <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setEditing(false)}>Cancel</button><button type="submit" className="primary-button"><Check size={16} /> Save settings</button></div>
          </form>
          <form className="password-form" onSubmit={changePassword}>
            <h3>Change admin password</h3>
            {usingDefault && <p className="form-error" role="alert">You are using the default password (madhat). Please change it.</p>}
            <div className="form-fields">
              <label><span>Current password</span><input type="password" required autoComplete="current-password" value={pwCurrent} onChange={event => setPwCurrent(event.target.value)} /></label>
              <label><span>New password (8+ characters)</span><input type="password" required minLength={8} autoComplete="new-password" value={pwNext} onChange={event => setPwNext(event.target.value)} /></label>
              <label><span>Confirm new password</span><input type="password" required minLength={8} autoComplete="new-password" value={pwConfirm} onChange={event => setPwConfirm(event.target.value)} /></label>
            </div>
            {pwMessage && <p className={pwMessage.ok ? 'form-success' : 'form-error'} role="alert">{pwMessage.text}</p>}
            <div className="modal-actions"><button type="submit" className="primary-button"><LockKeyhole size={16} /> Change password</button></div>
          </form>
        </section>
      </div>}
    </div>
  );
}
