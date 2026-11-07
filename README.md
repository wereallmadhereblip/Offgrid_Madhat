# Offgrid Madhat

A Docker-free, NOMAD-inspired command center for opening your own offline services. The dashboard runs locally on Kali Linux, Debian 13 (Trixie), and macOS Ventura (13) or later on supported Node.js hardware.

This is an independent dashboard, not Project NOMAD. It does **not** install, start, monitor, or update the linked applications, download offline content, or reproduce NOMAD's Docker-based app catalog, AI, maps, or knowledge base. Install and configure those separately before using their shortcuts.

## Kali Linux / Debian 13 setup

These steps install the dashboard itself. Linked services such as Kiwix or Ollama are separate installs; see [Native service setup](#native-service-setup).

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

Install Git and a Node.js release supported by both this project and your macOS version. The current Node.js LTS installers are available from [nodejs.org](https://nodejs.org/en/download/). Open Terminal and verify the tools:

```bash
node --version
npm --version
git --version
```

Node.js must be version 20 or later, and npm must be version 7 or later. Then clone and build the dashboard:

```bash
git clone https://github.com/wereallmadhereblip/Offgrid_Madhat.git
cd Offgrid_Madhat
sh install.sh
```

## Run the dashboard

Start the local web server from the project directory:

```bash
npm start
```

Open the URL printed in the terminal, usually <http://127.0.0.1:4173>. If that port is busy, Vite automatically selects another port and prints its URL. Leave the terminal open while using the dashboard; press Ctrl+C to stop the server. The installer needs internet access to download npm packages. Once built, the dashboard runs locally without Docker.

## Troubleshooting

### Node.js or npm version is too old

Check the installed versions with `node --version` and `npm --version`. This project requires Node.js 20+ and npm 7+. Install a compatible Node.js LTS release, open a new terminal, and run `sh install.sh` again.

### Dashboard does not open

Make sure `npm start` is still running and use the exact URL printed in its terminal. If port 4173 is occupied, Vite chooses the next available port automatically.

### A service tile does not work

The dashboard does not install or start its linked services. Install the service separately, make sure it is running, then choose **Configure services** and enter its correct HTTP or HTTPS address.

## Connect services

Use **Configure services** to set each application's full HTTP or HTTPS address. Addresses are stored in the current browser on the current device. The initial localhost ports are examples, not evidence that anything is installed or running:

| Resource | Example address | Separate software |
| --- | --- | --- |
| Information Library | http://localhost:8081 | [Kiwix](https://kiwix.org/) and ZIM files |
| Education Platform | http://localhost:8082 | [Kolibri](https://learningequality.org/kolibri/) and content |
| AI Assistant | http://localhost:8080 | [Open WebUI](https://docs.openwebui.com/) and [Ollama](https://ollama.com/) |
| Offline Maps | http://localhost:8084 | A separately installed map server and downloaded maps |
| Data Tools | http://localhost:8083 | [CyberChef](https://github.com/gchq/CyberChef) served locally |
| Notes | http://localhost:8085 | A separately installed notes application |
| Mesh Communications | http://localhost:8450 | Meshtastic Web and compatible radio hardware |

Ports, native installation methods, supported platforms, and offline capabilities vary by application. Consult each project's documentation. Some applications or features may not have a supported native installation on every listed OS. Each service needs its own offline data and must be running before its link will work.

## Native service setup

There is no single Docker-free installer for all these services. Their upstream projects have different operating-system requirements, and some need large content downloads or external hardware:

| Service | Native route and limitation |
| --- | --- |
| Kiwix | Use the official [Kiwix tools project](https://github.com/kiwix/kiwix-tools) and obtain ZIM archives separately. Check its current packages for your OS. |
| Kolibri | Use the official [Kolibri download page](https://learningequality.org/download/) for platform-specific installers and content. |
| AI Assistant | [Ollama](https://ollama.com/download) provides native installers; [Open WebUI](https://docs.openwebui.com/getting-started/quick-start/) documents a Python install route. Check Ollama's current macOS requirements before using Ventura. AI models require separate downloads and storage. |
| Offline Maps | [PMTiles](https://github.com/protomaps/PMTiles) is a map archive format, not a complete map server. You need compatible map data and a viewer. |
| Data Tools | [CyberChef](https://github.com/gchq/CyberChef) can be built from source without Docker; its current source instructions require Node.js 24, separate from this dashboard's Node.js 20 minimum. |
| Notes | [FlatNotes](https://github.com/dullage/flatnotes) recommends Docker for self-hosting and does not document a supported native install path. |
| Mesh Communications | [Meshtastic Web](https://github.com/meshtastic/web) is the browser client; actual radio communication requires compatible Meshtastic hardware and browser connectivity support. |

The dashboard links to these services but does not install or supervise them. In particular, do not treat FlatNotes as a supported Docker-free install, or assume every native app supports macOS Ventura just because the dashboard does.

The dashboard listens only on `127.0.0.1` by default. Localhost addresses refer to the computer running the browser. Do not expose the dashboard or linked services to a network without configuring appropriate authentication and access controls.

## Development

Run `npm run dev` for the Vite development server or `npm run build` to rebuild after changes. Run `npm ci` to reinstall the locked dependencies. GitHub Actions checks the dashboard build on Ubuntu 24.04 and macOS 14/15 with Node.js 20, 22, and 24; these checks do not install or validate the service backends, Kali, Debian Trixie, or macOS Ventura.