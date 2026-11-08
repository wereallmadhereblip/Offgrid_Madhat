# Offgrid Madhat

A Docker-free, NOMAD-inspired command center for opening your own offline services. The supported installers run on Debian-based Linux, including Kali Linux and Debian 13 (Trixie).

This is an independent dashboard, not Project NOMAD. The dashboard itself does not install, start, or update linked applications or download offline content. The native setup script can install several linked applications separately; it does not reproduce NOMAD's Docker-based app catalog, AI, maps, or knowledge base.

## One-command install (Debian / Kali / Ubuntu)

`setup.sh` installs the dashboard and the linked apps natively (no Docker), as your normal user, using `sudo` only where needed:

```bash
git clone https://github.com/wereallmadhereblip/Offgrid_Madhat.git
cd Offgrid_Madhat
bash setup.sh            # asks before installing
bash setup.sh --yes      # non-interactive, all apps
bash setup.sh --apps dashboard,ollama,kiwix --yes
bash setup.sh --dry-run  # show the plan only
```

Apps: `dashboard`, `ollama`, `openwebui` (8080), `kolibri` (8082), `kiwix` (8081), `jellyfin` (8096), `cyberchef` (8083), `meshtastic` (8450). Each is installed independently; a failure is reported at the end and does not stop the others. With systemd, services are named `offgrid-<app>` (Ollama and Jellyfin use their own units).

The dashboard service listens on all IPv4 interfaces by default, so other computers can open `http://<dashboard-computer-IP>:4173`. Find the address with `hostname -I`; network and firewall settings must permit TCP port 4173. Set `OFFGRID_BIND=127.0.0.1` when running setup to restrict it to the local computer. **Change the default admin password** and use HTTPS or a trusted network: dashboard passwords otherwise travel over plain HTTP.

For an existing systemd installation, update the checkout and rerun `bash setup.sh --apps dashboard --yes` to apply the new default; this restarts the dashboard service. Existing installations are not changed automatically by updating the files.

Environment variables: `OFFGRID_APPS`, `OFFGRID_HOME` (default `~/.local/share/offgrid-madhat`), `OFFGRID_BIND` (optional override for app listening addresses; dashboard defaults to `0.0.0.0`, other managed apps to `127.0.0.1`), `OFFGRID_ADMIN_PASSWORD` (optional; default admin password is `madhat`), `OLLAMA_MODEL` (optional model to pull), `KIWIX_ZIM_URL` (optional ZIM to download).

Limits: Maps and Notes are not auto-installed. Kiwix needs at least one `.zim` file in its `library/` folder before it starts. Open WebUI asks you to create the first account on first visit. On Kali, the Jellyfin installer asks for repo OS/release (`debian` / `trixie`). The Meshcore-Madhat bot itself is not installed; only its installer pattern is reused.

## Kali Linux / Debian 13 setup

These steps install only the dashboard itself. Linked services such as Kiwix or Ollama are separate installs; see [Native service setup](#native-service-setup).

Check your system and install the basic tools:

```bash
uname -m
dpkg --print-architecture
sudo apt update
sudo apt install -y git nodejs npm
node --version
npm --version
```

Node.js must be version 20 or later, and npm must be version 7 or later. If your distribution packages are older, install a compatible Node.js LTS release from [nodejs.org](https://nodejs.org/en/download/) and repeat the version checks.

Download and build Offgrid Madhat as your normal user:

```bash
git clone https://github.com/wereallmadhereblip/Offgrid_Madhat.git
cd Offgrid_Madhat
sh install.sh
```

## Run the dashboard

When installed with `setup.sh` on a system with systemd, the dashboard service starts automatically. For a dashboard-only installation with `install.sh`, start the web server from the project directory:

```bash
npm start
```

Open <http://127.0.0.1:4173>. Set `OFFGRID_PORT` to use another port, and `OFFGRID_HOST` to listen on another address (see [Admin access and updates](#admin-access-and-updates)). Leave the terminal open while using the dashboard; press Ctrl+C to stop the server. The installer needs internet access to download npm packages. Once built, the dashboard runs locally without Docker.

## Troubleshooting

### Apps failed during setup

The final summary lists failed apps, but their error messages appear earlier in the setup output. Retry the affected apps using a comma-separated list and capture the output for diagnosis:

```bash
bash setup.sh --apps dashboard,openwebui,kolibri,jellyfin,cyberchef 2>&1 | tee setup-retry.log
```

Replace the list with the apps that failed. Review the first error under each app's installation heading; remove any sensitive information before sharing the log.

### Node.js or npm version is too old

Check the installed versions with `node --version` and `npm --version`. This project requires Node.js 20+ and npm 7+. Install a compatible Node.js LTS release, open a new terminal, and run `sh install.sh` again.

### Dashboard does not open

For a systemd installation, check `systemctl status offgrid-dashboard`; otherwise make sure `npm start` is still running. If port 4173 is occupied, set a different `OFFGRID_PORT` for a manual start. For network access, check the dashboard computer's IP address and firewall.

### A service tile does not work

The dashboard does not itself install or start linked services. Use the appropriate setup script or install the service separately, make sure it is running, then choose **Configure services** and enter its correct HTTP or HTTPS address.

## Connect services

Admins use **Configure services** to set each application's full HTTP or HTTPS address; see [Admin access and updates](#admin-access-and-updates) to log in. Addresses are saved on the server in `data/services.json` and shared by everyone using the dashboard. Addresses containing `localhost` point to each visitor's own device, so use the host's IP address or hostname if other devices will open the tiles. The initial localhost ports are examples, not evidence that anything is installed or running:

| Resource | Example address | Separate software |
| --- | --- | --- |
| Information Library | http://localhost:8081 | [Kiwix](https://kiwix.org/) and ZIM files |
| Education Platform | http://localhost:8082 | [Kolibri](https://learningequality.org/kolibri/) and content |
| AI Assistant | http://localhost:8080 | [Open WebUI](https://docs.openwebui.com/) and [Ollama](https://ollama.com/) |
| Offline Maps | http://localhost:8084 | A separately installed map server and downloaded maps |
| Data Tools | http://localhost:8083 | [CyberChef](https://github.com/gchq/CyberChef) served locally |
| Media Library | http://localhost:8096 | [Jellyfin](https://jellyfin.org/) and your own media files |
| Notes | http://localhost:8085 | A separately installed notes application |
| Mesh Communications | http://localhost:8450 | Meshtastic Web and compatible radio hardware |

Ports, native installation methods, supported platforms, and offline capabilities vary by application. Consult each project's documentation. Some applications or features may not have a supported native installation on every listed OS. Each service needs its own offline data and must be running before its link will work.

## Admin access and updates

Only admins can change service addresses or see update notices. The server enforces this; the browser cannot bypass it.

- The default admin password is `madhat`. Change it after logging in: lock-icon area > **Settings** > **Change admin password** (8+ characters; the dashboard warns while the default is in use). **Change it before exposing the dashboard to anyone else.** `OFFGRID_ADMIN_PASSWORD='at-least-8-chars'` set at start (or with `setup.sh`) replaces the stored password on every start, so leave it unset if you want the dashboard-changed password to persist.
- Click the gear icon in the header to log in. Use the lock icon to log out. Sessions last up to 12 hours and are cleared when the server restarts.
- Admin data is stored in `data/` (mode 600 files, git-ignored). Failed logins are rate limited.

Every 24 hours the server asks each supported app for its installed version and compares it with the latest upstream release on GitHub. When a newer version exists, logged-in admins see an **Update available** button on that tile that opens the official download page. Use **Check for updates** to run a check immediately.

| App | Installed version read from | Latest release from |
| --- | --- | --- |
| Jellyfin | `/System/Info/Public` | `jellyfin/jellyfin` |
| Open WebUI | `/api/version` | `open-webui/open-webui` |
| Kolibri | `/api/public/info/` | `learningequality/kolibri` |

Limits: the dashboard never installs or updates apps itself. Other apps (Kiwix, maps, CyberChef, notes, Meshtastic Web, Ollama) do not expose a version this way and are not checked. Checks need internet access to reach GitHub; offline, the installed version is still read but no update can be reported. The server fetches the addresses admins configure, so only trusted people should have the admin password. The version endpoints above are expected from each project's API and may change between releases.

The `setup.sh` dashboard service listens on `0.0.0.0` by default; a manually started server listens on `127.0.0.1` unless `OFFGRID_HOST` is set. Use HTTPS or a trusted network when exposing it, since admin passwords are sent in plain HTTP otherwise.

## Native service setup

There is no single Docker-free installer for all these services. Their upstream projects have different operating-system requirements, and some need large content downloads or external hardware:

| Service | Native route and limitation |
| --- | --- |
| Kiwix | Use the official [Kiwix tools project](https://github.com/kiwix/kiwix-tools) and obtain ZIM archives separately. Check its current packages for your OS. |
| Kolibri | Use the official [Kolibri download page](https://learningequality.org/download/) for platform-specific installers and content. |
| AI Assistant | [Ollama](https://ollama.com/download) provides native installers; [Open WebUI](https://docs.openwebui.com/getting-started/quick-start/) documents a Python install route. AI models require separate downloads and storage. |
| Offline Maps | [PMTiles](https://github.com/protomaps/PMTiles) is a map archive format, not a complete map server. You need compatible map data and a viewer. |
| Data Tools | [CyberChef](https://github.com/gchq/CyberChef) can be built from source without Docker; its current source instructions require Node.js 24, separate from this dashboard's Node.js 20 minimum. |
| Media Library | Use the official [Jellyfin downloads](https://jellyfin.org/downloads/) for native server packages. Check current support for your OS, and add your own media libraries separately. |
| Notes | [FlatNotes](https://github.com/dullage/flatnotes) recommends Docker for self-hosting and does not document a supported native install path. |
| Mesh Communications | [Meshtastic Web](https://github.com/meshtastic/web) is the browser client; actual radio communication requires compatible Meshtastic hardware and browser connectivity support. |

The dashboard links to these services but does not install or supervise them. In particular, do not treat FlatNotes as a supported Docker-free install.

Localhost addresses refer to the computer running the browser. Do not expose the dashboard or linked services to an untrusted network without configuring appropriate authentication and access controls.

## Development

Run `npm start` in one terminal and `npm run dev` in another for the Vite development server, which proxies `/api` to port 4173, or run `npm run build` to rebuild after changes. Run `npm ci` to reinstall the locked dependencies. GitHub Actions checks the dashboard build on Ubuntu 24.04 with Node.js 20, 22, and 24; these checks do not install or validate the service backends, Kali, or Debian Trixie.