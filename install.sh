#!/bin/sh
set -eu

cd "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"

case "$(uname -s)" in
  Linux)
    if [ ! -r /etc/os-release ]; then
      printf '%s\n' 'Cannot identify this Linux distribution. Debian Trixie and Kali Linux are supported.' >&2
      exit 1
    fi
    . /etc/os-release
    case "${ID:-} ${ID_LIKE:-}" in
      *debian*|*kali*) ;;
      *) printf '%s\n' 'This installer supports Debian-based Linux and macOS 13 or later.' >&2; exit 1 ;;
    esac
    ;;
  Darwin)
    mac_major=$(sw_vers -productVersion | cut -d. -f1)
    if [ "$mac_major" -lt 13 ]; then
      printf '%s\n' 'macOS Ventura (13) or later is required.' >&2
      exit 1
    fi
    ;;
  *) printf '%s\n' 'This installer supports Debian-based Linux and macOS 13 or later.' >&2; exit 1 ;;
esac

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  printf '%s\n' 'Node.js 20 or later and npm are required. See README.md for installation instructions.' >&2
  exit 1
fi
node_major=$(node -p 'Number(process.versions.node.split(".")[0])')
if [ "$node_major" -lt 20 ]; then
  printf '%s\n' 'Node.js 20 or later is required. See README.md for installation instructions.' >&2
  exit 1
fi
npm_major=$(npm --version | cut -d. -f1)
if [ "$npm_major" -lt 7 ]; then
  printf '%s\n' 'npm 7 or later is required. Update npm or install a newer Node.js release.' >&2
  exit 1
fi

npm ci --no-audit --no-fund
npm run build
printf '\n%s\n' 'Installation complete. Start the dashboard with: npm start' 'Open http://127.0.0.1:4173. The default admin password is madhat; change it in Settings.'