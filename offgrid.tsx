import { useState } from 'react';
import { BookOpen, Brain, Check, ExternalLink, GraduationCap, Map, NotebookPen, Radio, Settings, Shield, Sparkles, Wrench, X } from 'lucide-react';
import './style.css';

const services = [
  { id: 'library', title: 'Information Library', poweredBy: 'Kiwix', description: 'Offline access to Wikipedia, reference books, and practical guides.', icon: BookOpen, url: 'http://localhost:8081' },
  { id: 'education', title: 'Education Platform', poweredBy: 'Kolibri', description: 'Courses, lessons, and learning resources for all ages.', icon: GraduationCap, url: 'http://localhost:8082' },
  { id: 'ai', title: 'AI Assistant', poweredBy: 'Open WebUI + Ollama', description: 'Chat with a local AI model running on your own hardware.', icon: Brain, url: 'http://localhost:8080' },
  { id: 'maps', title: 'Offline Maps', poweredBy: 'Your map server', description: 'Explore your downloaded maps and geographic resources.', icon: Map, url: 'http://localhost:8084' },
  { id: 'tools', title: 'Data Tools', poweredBy: 'CyberChef', description: 'Encode, decode, analyze, and work with data locally.', icon: Wrench, url: 'http://localhost:8083' },
  { id: 'notes', title: 'Notes', poweredBy: 'Your notes app', description: 'Keep useful information and field notes close at hand.', icon: NotebookPen, url: 'http://localhost:8085' },
  { id: 'comms', title: 'Mesh Communications', poweredBy: 'Meshtastic Web', description: 'Connect to a compatible Meshtastic radio using its browser client.', icon: Radio, url: 'http://localhost:8450' },
];

type Addresses = Record<string, string>;
const storageKey = 'offgrid-madhat-addresses';

function readAddresses(): Addresses {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || '{}');
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return {};
    return Object.fromEntries(Object.entries(saved).filter(([, value]) => typeof value === 'string'));
  } catch {
    return {};
  }
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
  const [addresses, setAddresses] = useState<Addresses>(readAddresses);
  const [draft, setDraft] = useState<Addresses>({});
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState('');

  function openSettings() {
    setDraft(Object.fromEntries(services.map(service => [service.id, addresses[service.id] || service.url])));
    setError('');
    setEditing(true);
  }

  function saveSettings(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleaned = Object.fromEntries(services.map(service => [service.id, (draft[service.id] || '').trim()]));
    if (Object.values(cleaned).some(value => !validAddress(value))) {
      setError('Enter a complete HTTP or HTTPS address for every service.');
      return;
    }
    try {
      localStorage.setItem(storageKey, JSON.stringify(cleaned));
    } catch {
      setError('Your browser could not save these addresses. Check its storage settings.');
      return;
    }
    setAddresses(cleaned);
    setEditing(false);
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-inner">
          <a className="brand" href="#home" aria-label="Offgrid Madhat home"><Shield size={22} strokeWidth={1.8} /><span>OFFGRID <strong>MADHAT</strong></span></a>
          <div className="topbar-right"><span className="local-label"><span className="status-dot" /> LOCAL COMMAND CENTER</span><button className="settings-button" onClick={openSettings} title="Service settings" aria-label="Service settings"><Settings size={19} /></button></div>
        </div>
      </header>
      <main id="home" className="main-content">
        <div className="heading">
          <div className="emblem"><Shield size={34} strokeWidth={1.4} /><Sparkles className="emblem-spark" size={14} /></div>
          <div className="eyebrow">YOUR OFFLINE TOOLKIT</div>
          <h1>Command Center</h1>
          <p>Knowledge, tools, and resources. All in one place.</p>
        </div>
        <div className="section-heading"><div><span className="section-kicker">YOUR RESOURCES</span><h2>Explore your toolkit</h2></div><button className="text-button" onClick={openSettings}><Settings size={15} /> Configure services</button></div>
        <div className="service-grid">
          {services.map(service => {
            const Icon = service.icon;
            const configured = addresses[service.id];
            const address = configured && validAddress(configured) ? configured : service.url;
            return <a className="service-tile" key={service.id} href={address} target="_blank" rel="noopener noreferrer">
              <span className="tile-arrow"><ExternalLink size={16} /></span>
              <span className="tile-icon"><Icon size={28} strokeWidth={1.6} /></span>
              <h3>{service.title}</h3>
              <span className="powered-by">{service.poweredBy}</span>
              <p>{service.description}</p>
              <span className="tile-action">OPEN SERVICE <span aria-hidden="true">&rarr;</span></span>
            </a>;
          })}
          <button className="service-tile setup-tile" onClick={openSettings}>
            <span className="tile-icon"><Settings size={28} strokeWidth={1.6} /></span>
            <h3>Service Settings</h3>
            <span className="powered-by">MAKE IT YOURS</span>
            <p>Connect the tools you have installed by setting their local addresses.</p>
            <span className="tile-action">CONFIGURE <span aria-hidden="true">&rarr;</span></span>
          </button>
        </div>
        <div className="notice"><span className="notice-icon"><Shield size={17} /></span><p><strong>Built for your own infrastructure.</strong> Services and offline content are installed separately. Availability is not monitored by this dashboard.</p></div>
      </main>
      <footer><span>OFFGRID MADHAT</span><span>YOUR KNOWLEDGE. YOUR HARDWARE.</span></footer>
      {editing && <div className="modal-backdrop" onClick={() => setEditing(false)}>
        <section className="modal" role="dialog" aria-modal="true" aria-labelledby="settings-title" onClick={event => event.stopPropagation()}>
          <div className="modal-header"><div><span className="section-kicker">YOUR TOOLKIT</span><h2 id="settings-title">Service settings</h2></div><button className="icon-button" onClick={() => setEditing(false)} aria-label="Close settings" title="Close"><X size={20} /></button></div>
          <p className="modal-description">Enter the address of each service. These settings are saved in this browser.</p>
          <form onSubmit={saveSettings}>
            <div className="form-fields">{services.map(service => <label key={service.id}><span>{service.title}</span><input type="url" required value={draft[service.id] || ''} onChange={event => setDraft({ ...draft, [service.id]: event.target.value })} /></label>)}</div>
            {error && <p className="form-error" role="alert">{error}</p>}
            <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setEditing(false)}>Cancel</button><button type="submit" className="primary-button"><Check size={16} /> Save settings</button></div>
          </form>
        </section>
      </div>}
    </div>
  );
}