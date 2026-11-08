# Offgrid Madhat

A Docker-free, NOMAD-inspired command center for opening your own offline services. The dashboard runs locally on Kali Linux, Debian 13 (Trixie), and macOS Ventura (13) or later on supported Node.js hardware.

This is an independent dashboard, not Project NOMAD. The dashboard itself does not install, start, or update linked applications or download offline content. The native setup scripts below can install several linked applications separately; they do not reproduce NOMAD's Docker-based app catalog, AI, maps, or knowledge base.

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

Environment variables: `OFFGRID_APPS`, `OFFGRID_HOME` (default `~/.local/share/offgrid-madhat`), `OFFGRID_BIND` (default `127.0.0.1`), `OFFGRID_ADMIN_PASSWORD` (optional; default admin password is `madhat`), `OLLAMA_MODEL` (optional model to pull), `KIWIX_ZIM_URL` (optional ZIM to download).

Limits: Maps and Notes are not auto-installed. Kiwix needs at least one `.zim` file in its `library/` folder before it starts. Open WebUI asks you to create the first account on first visit. On Kali, the Jellyfin installer asks for repo OS/release (`debian` / `trixie`). `setup.sh` is Linux-only; use the macOS instructions below on a Mac. The Meshcore-Madhat bot itself is not installed; only its installer pattern is reused.

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

## macOS Ventura or later setup

Open Terminal and run:

```bash
curl -fsSLo macos-setup.sh https://raw.githubusercontent.com/wereallmadhereblip/Offgrid_Madhat/main/macos-setup.sh &&
sh macos-setup.sh
```

This checks macOS and installs missing Git through Apple's Command Line Tools and, if needed, Node.js 22 from [nodejs.org](https://nodejs.org/en/download/). Approve the Apple installer dialog and wait for it to finish when prompted; installing Node.js requires an administrator password. The script clones into `Offgrid_Madhat` and asks before installing the same app selections as the Linux installer. It needs internet access and will not overwrite an existing destination. Install [Homebrew](https://brew.sh/) first for apps other than the dashboard; Homebrew may also require administrator access.

```bash
sh macos-setup.sh --yes                           # install all selections
sh macos-setup.sh my-folder --apps dashboard,ollama --yes

# If you already cloned the project, or to retry failed apps:
cd Offgrid_Madhat
git pull
bash macos-apps.sh --dry-run                      # preview selections
bash macos-apps.sh --apps dashboard,ollama --yes
bash macos-apps.sh --yes                          # all selections
```

The macOS installer accepts the same app names and environment variables listed above. It installs Ollama, Jellyfin, Kiwix, Python, Open WebUI, Kolibri, CyberChef and Meshtastic Web natively, and sets up per-user launchd services for the dashboard, Ollama, Open WebUI, Kolibri, CyberChef, Meshtastic Web and Jellyfin. These start while the installing user is logged in; logs are in `~/.local/share/offgrid-madhat/logs` (or `$OFFGRID_HOME/logs`). Jellyfin runs as a macOS application and needs its setup wizard. First-time Open WebUI setup creates an admin account. AI models, ZIMs, education content, and media are not included; use `OLLAMA_MODEL` or `KIWIX_ZIM_URL` to download a model or ZIM during setup.

**Kiwix limitation:** macOS installs the Kiwix desktop app, not the Linux `kiwix-serve` web service. Open the app and import ZIM files from `~/.local/share/offgrid-madhat/kiwix/library` (or `$OFFGRID_HOME/kiwix/library`). The dashboard's Information Library tile requires a separately configured Kiwix web server. The current Homebrew Kiwix cask requires macOS 14 or newer; on Ventura its installation can fail, and the installer reports the failure and continues with the other apps. Maps and Notes remain separate installations.

The downloaded script can be inspected before running it. If an older Node.js from a version manager takes precedence in your terminal after installation, adjust your `PATH` or switch to Node.js 20+ before starting the dashboard. If the clone succeeds but app setup fails, retry from the existing checkout with `bash macos-apps.sh --apps ...` rather than cloning again.

## Run the dashboard

Start the local web server from the project directory:

```bash
npm start
```

Open <http://127.0.0.1:4173>. Set `OFFGRID_PORT` to use another port, and `OFFGRID_HOST` to listen on another address (see [Admin access and updates](#admin-access-and-updates)). Leave the terminal open while using the dashboard; press Ctrl+C to stop the server. The installer needs internet access to download npm packages. Once built, the dashboard runs locally without Docker.

## Troubleshooting

### Node.js or npm version is too old

Check the installed versions with `node --version` and `npm --version`. This project requires Node.js 20+ and npm 7+. Install a compatible Node.js LTS release, open a new terminal, and run `sh install.sh` again.

### Dashboard does not open

Make sure `npm start` is still running and use the URL printed in its terminal. If port 4173 is occupied, set a different `OFFGRID_PORT`.

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

The server listens only on `127.0.0.1` by default. To let others on your network use it, set `OFFGRID_HOST=0.0.0.0` and put it behind HTTPS or a trusted network, since admin passwords are sent in plain HTTP otherwise.

## Native service setup

There is no single Docker-free installer for all these services. Their upstream projects have different operating-system requirements, and some need large content downloads or external hardware:

| Service | Native route and limitation |
| --- | --- |
| Kiwix | Use the official [Kiwix tools project](https://github.com/kiwix/kiwix-tools) and obtain ZIM archives separately. Check its current packages for your OS. |
| Kolibri | Use the official [Kolibri download page](https://learningequality.org/download/) for platform-specific installers and content. |
| AI Assistant | [Ollama](https://ollama.com/download) provides native installers; [Open WebUI](https://docs.openwebui.com/getting-started/quick-start/) documents a Python install route. Check Ollama's current macOS requirements before using Ventura. AI models require separate downloads and storage. |
| Offline Maps | [PMTiles](https://github.com/protomaps/PMTiles) is a map archive format, not a complete map server. You need compatible map data and a viewer. |
| Data Tools | [CyberChef](https://github.com/gchq/CyberChef) can be built from source without Docker; its current source instructions require Node.js 24, separate from this dashboard's Node.js 20 minimum. |
| Media Library | Use the official [Jellyfin downloads](https://jellyfin.org/downloads/) for native server packages. Check current support for your OS, and add your own media libraries separately. |
| Notes | [FlatNotes](https://github.com/dullage/flatnotes) recommends Docker for self-hosting and does not document a supported native install path. |
| Mesh Communications | [Meshtastic Web](https://github.com/meshtastic/web) is the browser client; actual radio communication requires compatible Meshtastic hardware and browser connectivity support. |

The dashboard links to these services but does not install or supervise them. In particular, do not treat FlatNotes as a supported Docker-free install, or assume every native app supports macOS Ventura just because the dashboard does.

The dashboard listens only on `127.0.0.1` by default. Localhost addresses refer to the computer running the browser. Do not expose the dashboard or linked services to a network without configuring appropriate authentication and access controls.

## Development

Run `npm start` in one terminal and `npm run dev` in another for the Vite development server, which proxies `/api` to port 4173, or run `npm run build` to rebuild after changes. Run `npm ci` to reinstall the locked dependencies. GitHub Actions checks the dashboard build on Ubuntu 24.04 and macOS 14/15 with Node.js 20, 22, and 24; these checks do not install or validate the service backends, Kali, Debian Trixie, or macOS Ventura.