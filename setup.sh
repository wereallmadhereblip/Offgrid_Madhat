#!/usr/bin/env bash
# Offgrid Madhat one-step installer (Debian 13, Kali and other Debian-based Linux).
# Installs the dashboard plus the apps it links to, without Docker, and starts
# them at boot with systemd.
#
# Usage: bash setup.sh [--apps LIST] [--yes] [--dry-run] [--help]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ALL_APPS="dashboard ollama openwebui kolibri kiwix jellyfin cyberchef meshtastic"

APPS="${OFFGRID_APPS:-}"
ASSUME_YES=false
DRY_RUN=false
INSTALL_ROOT="${OFFGRID_HOME:-$HOME/.local/share/offgrid-madhat}"
BIND="${OFFGRID_BIND:-127.0.0.1}"
DASHBOARD_BIND="${OFFGRID_BIND:-0.0.0.0}"
FAILED=()
ADMIN_NOTE=""
STATE_DIR="$(mktemp -d)"
trap 'rm -rf "$STATE_DIR"' EXIT

usage() {
  cat <<EOF
Usage: bash setup.sh [--apps LIST] [--yes] [--dry-run] [--help]

  --apps LIST  Comma-separated apps to install (default: all).
               Choices: ${ALL_APPS// /, }
  --yes        Do not ask for confirmation.
  --dry-run    Print what would be done without changing anything.

Environment variables:
  OFFGRID_APPS            Same as --apps.
  OFFGRID_HOME            Where app files and data live (default: ~/.local/share/offgrid-madhat).
  OFFGRID_BIND            Override the listening address (dashboard default: 0.0.0.0; other apps: 127.0.0.1).
  OFFGRID_ADMIN_PASSWORD  Dashboard admin password (8+ characters). Default: madhat, changeable in the dashboard.
  OLLAMA_MODEL            Model to download after installing Ollama (for example llama3.2:1b).
  KIWIX_ZIM_URL           Direct URL of a .zim file to download for Kiwix.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --apps) APPS="${2:?--apps needs a value}"; shift 2 ;;
    --yes|-y) ASSUME_YES=true; shift ;;
    --dry-run) DRY_RUN=true; shift ;;
    --help|-h) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage >&2; exit 2 ;;
  esac
done

log() { printf '\n==> %s\n' "$*"; }
warn() { printf 'WARNING: %s\n' "$*" >&2; }
die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

run() {
  if $DRY_RUN; then
    printf '[dry-run] %s\n' "$*"
  else
    "$@"
  fi
}

# Each app installs in a subshell, so results are recorded in files rather than variables.
add_summary() { printf '%s\n' "$*" >>"$STATE_DIR/summary"; }
add_manual() { printf '%s\n' "$*" >>"$STATE_DIR/manual"; }
add_admin_note() { printf '%s\n' "$*" >"$STATE_DIR/admin"; }

wants() { [[ " $APPS " == *" $1 "* ]]; }
system_python() { command -v /usr/bin/python3 || command -v python3 || echo python3; }
has_systemd() { [[ -d /run/systemd/system ]] && command -v systemctl >/dev/null 2>&1; }

# Downloads a file to a temporary path with validation and retries on failure.
download() {
  local url="$1" target="$2" retries=0 max_retries=3
  while [[ $retries -lt $max_retries ]]; do
    if run curl -fsSL --retry 3 --connect-timeout 15 --max-time 120 "$url" -o "$target"; then
      return 0
    fi
    ((retries++))
    if [[ $retries -lt $max_retries ]]; then
      warn "Download failed (attempt $retries/$max_retries), retrying in 5 seconds..."
      sleep 5
    fi
  done
  die "Failed to download $url after $max_retries attempts."
}

check_platform() {
  [[ $EUID -ne 0 ]] || die "Run this as your normal user, not root or with sudo. It uses sudo only where needed."

  case "$(uname -s)" in
    Linux) ;;
    *) die "This installer supports Debian-based Linux only." ;;
  esac

  [[ -r /etc/os-release ]] || die "Cannot identify this Linux distribution."
  # shellcheck disable=SC1091
  . /etc/os-release
  case "${ID:-} ${ID_LIKE:-}" in
    *debian*|*kali*|*ubuntu*) ;;
    *) die "This installer supports Debian-based Linux (Debian 13, Kali) only." ;;
  esac
  command -v apt-get >/dev/null 2>&1 || die "apt-get is required."

  ARCH="$(dpkg --print-architecture)"
  log "System: ${PRETTY_NAME:-Linux} ($(uname -m), dpkg: $ARCH)"
  case "$ARCH" in
    amd64|arm64|armhf) ;;
    *) warn "Architecture $ARCH is untested; some apps may fail to install." ;;
  esac
}

normalize_apps() {
  if [[ -z "$APPS" ]]; then
    APPS="$ALL_APPS"
  fi
  APPS="${APPS//,/ }"
  local app
  for app in $APPS; do
    [[ " $ALL_APPS " == *" $app "* ]] || die "Unknown app '$app'. Choices: ${ALL_APPS// /, }"
  done
}

confirm() {
  $ASSUME_YES && return 0
  $DRY_RUN && return 0
  echo
  echo "This will install: $APPS"
  echo "Files and data: $INSTALL_ROOT"
  echo "It uses sudo for system packages and services, and downloads several GB if you choose AI models or Kiwix content."
  if wants dashboard && [[ "$DASHBOARD_BIND" != 127.0.0.1 ]]; then
    echo "The dashboard will listen on $DASHBOARD_BIND. Use a trusted network or HTTPS and change the default admin password."
  fi
  if [[ ! -t 0 ]]; then
    die "Not running in a terminal. Re-run with --yes to confirm."
  fi
  read -rp "Continue? [Y/n] " answer
  [[ ! "$answer" =~ ^[Nn] ]] || exit 0
}

setup_sudo() {
  SUDO="sudo"
  if $DRY_RUN; then return; fi
  command -v sudo >/dev/null 2>&1 || die "sudo is required."
  sudo -v || die "sudo access is required."
}

apt_install() {
  run $SUDO env DEBIAN_FRONTEND=noninteractive apt-get install -y "$@"
}

install_base() {
  log "Installing base tools"
  run $SUDO apt-get update
  local packages=(git curl ca-certificates tar unzip gzip openssl python3 python3-venv python3-pip)
  wants dashboard && packages+=(nodejs npm)
  wants ollama && packages+=(zstd)
  wants kiwix && packages+=(kiwix-tools)
  apt_install "${packages[@]}"
  if ! $DRY_RUN; then
    printf 'python3 %s\n' "$(python3 --version 2>&1 | cut -d' ' -f2)"
  fi
}

# Writes and enables a systemd unit that runs as the current user.
# Set SERVICE_ENABLE=false before the call to write the unit without starting it.
# usage: install_service NAME DESCRIPTION EXECSTART [ENV=VALUE ...]
install_service() {
  local name="$1" description="$2" execstart="$3"
  shift 3
  local unit="/etc/systemd/system/offgrid-$name.service" env_lines="" item
  for item in "$@"; do
    env_lines+="Environment=\"$item\""$'\n'
  done
  local content
  content="[Unit]
Description=$description
After=network-online.target
Wants=network-online.target

[Service]
User=$(id -un)
WorkingDirectory=$INSTALL_ROOT
${env_lines}ExecStart=$execstart
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target"

  if $DRY_RUN; then
    printf '[dry-run] write %s:\n%s\n' "$unit" "$content"
    return 0
  fi
  if ! has_systemd; then
    [[ "${SERVICE_ENABLE:-true}" == true ]] || return 0
    local manual_env="" quoted
    for item in "$@"; do
      printf -v quoted '%q' "$item"
      manual_env+=" $quoted"
    done
    add_manual "$description: env$manual_env $execstart"
    return 0
  fi
  local was_active=false
  if [[ "$name" == dashboard ]] && systemctl is-active --quiet "offgrid-$name.service"; then
    was_active=true
  fi
  printf '%s\n' "$content" | $SUDO tee "$unit" >/dev/null
  $SUDO systemctl daemon-reload
  if [[ "${SERVICE_ENABLE:-true}" == true ]]; then
    $SUDO systemctl enable --now "offgrid-$name.service"
    if $was_active; then
      $SUDO systemctl restart "offgrid-$name.service"
    fi
  fi
}

install_dashboard() {
  log "Installing the dashboard"
  local node_major
  command -v node >/dev/null 2>&1 || $DRY_RUN || die "Node.js was not installed."
  if ! $DRY_RUN; then
    node_major="$(node -p 'Number(process.versions.node.split(".")[0])')"
    [[ "$node_major" -ge 20 ]] || die "Node.js 20 or later is required (found $(node --version)). Install a current LTS from https://nodejs.org/en/download/ and re-run."
  fi
  run mkdir -p "$INSTALL_ROOT"
  run sh "$SCRIPT_DIR/install.sh" || die "Dashboard installation (install.sh) failed."

  if [[ -n "${OFFGRID_ADMIN_PASSWORD:-}" ]]; then
    if $DRY_RUN; then
      echo "[dry-run] set the dashboard admin password from OFFGRID_ADMIN_PASSWORD"
    else
      (cd "$SCRIPT_DIR" && node server.mjs --set-admin-password) || die "Failed to set dashboard admin password."
    fi
    add_admin_note "Dashboard admin password set from OFFGRID_ADMIN_PASSWORD."
  elif [[ -f "$SCRIPT_DIR/data/admin.json" ]]; then
    add_admin_note "Dashboard admin password unchanged."
  else
    add_admin_note "Dashboard admin password is the default: madhat. Change it in the dashboard (lock icon > Change admin password)."
  fi

  install_service dashboard "Offgrid Madhat dashboard" "$(command -v node || echo node) $SCRIPT_DIR/server.mjs" \
    "OFFGRID_HOST=$DASHBOARD_BIND" "OFFGRID_PORT=4173"
  add_summary "Dashboard          http://127.0.0.1:4173"
  if [[ "$DASHBOARD_BIND" != 127.0.0.1 ]]; then
    add_summary "Network access: use http://<this-computer-IP>:4173 from another computer (find the IP with hostname -I)."
    add_summary "Network access depends on firewall and network settings; change the default admin password and use HTTPS or a trusted network."
  fi
}

install_ollama() {
  log "Installing Ollama"
  if ! command -v ollama >/dev/null 2>&1; then
    local script
    script="$(mktemp)"
    download https://ollama.com/install.sh "$script"
    run sh "$script"
    rm -f "$script"
  else
    echo "Ollama is already installed."
  fi

  if [[ -n "${OLLAMA_MODEL:-}" ]] && ! $DRY_RUN; then
    local attempt
    for attempt in $(seq 1 30); do
      curl -fsS http://127.0.0.1:11434/api/tags >/dev/null 2>&1 && break
      sleep 1
    done
    if curl -fsS http://127.0.0.1:11434/api/tags >/dev/null 2>&1; then
      ollama pull "$OLLAMA_MODEL"
    else
      warn "The Ollama server is not running; download the model later with: ollama pull $OLLAMA_MODEL"
    fi
  elif [[ -n "${OLLAMA_MODEL:-}" ]]; then
    echo "[dry-run] ollama pull $OLLAMA_MODEL"
  else
    echo "No model downloaded. Download one later with, for example: ollama pull llama3.2:1b"
  fi
}

# Open WebUI needs Python 3.11 or 3.12 but Debian 13 ships 3.13, so uv provides 3.12.
install_openwebui() {
  log "Installing Open WebUI"
  local dir="$INSTALL_ROOT/open-webui"
  run mkdir -p "$dir/data"
  if ! $DRY_RUN; then
    command -v python3 >/dev/null 2>&1 || die "python3 is required for Open WebUI."
    run python3 -m venv "$dir/uv-env" || die "Failed to create Python venv for uv."
    run "$dir/uv-env/bin/pip" install --quiet --upgrade uv || die "Failed to install uv."
    run "$dir/uv-env/bin/uv" venv --python 3.12 --allow-existing "$dir/venv" || die "Failed to create Python 3.12 venv."
    run "$dir/uv-env/bin/uv" pip install --python "$dir/venv/bin/python" --upgrade open-webui || die "Failed to install open-webui."
  else
    run python3 -m venv "$dir/uv-env"
    run "$dir/uv-env/bin/pip" install --quiet --upgrade uv
    run "$dir/uv-env/bin/uv" venv --python 3.12 --allow-existing "$dir/venv"
    run "$dir/uv-env/bin/uv" pip install --python "$dir/venv/bin/python" --upgrade open-webui
  fi
  install_service openwebui "Open WebUI" \
    "$dir/venv/bin/open-webui serve --host $BIND --port 8080" \
    "DATA_DIR=$dir/data" "OLLAMA_BASE_URL=http://127.0.0.1:11434"
  add_summary "AI Assistant       http://127.0.0.1:8080  (create the first account in the browser; it becomes admin)"
}

install_kolibri() {
  log "Installing Kolibri"
  local dir="$INSTALL_ROOT/kolibri"
  run mkdir -p "$dir/data"
  if ! $DRY_RUN; then
    command -v python3 >/dev/null 2>&1 || die "python3 is required for Kolibri."
    run python3 -m venv "$dir/venv" || die "Failed to create Python venv for Kolibri."
    run "$dir/venv/bin/pip" install --quiet --upgrade pip kolibri || die "Failed to install Kolibri."
  else
    run python3 -m venv "$dir/venv"
    run "$dir/venv/bin/pip" install --quiet --upgrade pip kolibri
  fi
  install_service kolibri "Kolibri" \
    "$dir/venv/bin/kolibri start --foreground --port 8082" \
    "KOLIBRI_HOME=$dir/data" "KOLIBRI_LISTEN_ADDRESS=$BIND"
  add_summary "Education Platform http://127.0.0.1:8082  (finish the setup wizard in the browser)"
}

install_kiwix() {
  log "Setting up Kiwix"
  local dir="$INSTALL_ROOT/kiwix"
  run mkdir -p "$dir/library"
  if [[ -n "${KIWIX_ZIM_URL:-}" ]]; then
    case "$KIWIX_ZIM_URL" in
      https://*.zim|http://*.zim) ;;
      *) die "KIWIX_ZIM_URL must be a direct http(s) link to a .zim file." ;;
    esac
    run curl -fL --retry 3 --connect-timeout 15 -C - -o "$dir/library/$(basename "${KIWIX_ZIM_URL%%\?*}")" "$KIWIX_ZIM_URL"
  fi

  # kiwix-serve needs at least one ZIM file, so the wrapper reports a clear error without one.
  if $DRY_RUN; then
    echo "[dry-run] write $dir/serve.sh"
  else
    cat >"$dir/serve.sh" <<EOF
#!/usr/bin/env bash
shopt -s nullglob
files=("$dir"/library/*.zim)
if [[ \${#files[@]} -eq 0 ]]; then
  echo "No .zim files in $dir/library. Add one, then run: sudo systemctl restart offgrid-kiwix" >&2
  exit 1
fi
exec kiwix-serve --address "$BIND" --port 8081 "\${files[@]}"
EOF
    chmod +x "$dir/serve.sh"
  fi

  if $DRY_RUN || compgen -G "$dir/library/*.zim" >/dev/null; then
    install_service kiwix "Kiwix" "$dir/serve.sh"
    add_summary "Information Library http://127.0.0.1:8081"
  else
    SERVICE_ENABLE=false install_service kiwix "Kiwix" "$dir/serve.sh"
    add_summary "Information Library installed but not started: put a .zim file in $dir/library (get one from https://library.kiwix.org/), then run: sudo systemctl enable --now offgrid-kiwix"
  fi
}

install_jellyfin() {
  log "Installing Jellyfin"
  if dpkg -s jellyfin-server >/dev/null 2>&1 || dpkg -s jellyfin >/dev/null 2>&1; then
    echo "Jellyfin is already installed."
  else
    local script status
    script="$(mktemp)"
    download https://repo.jellyfin.org/install-debuntu.sh "$script"
    # On derivatives such as Kali the installer cannot detect the base release and asks for it.
    if ! $DRY_RUN && ! grep -qE '^(DEBIAN|UBUNTU)_CODENAME=' /etc/os-release && [[ ! "${ID:-}" =~ ^(debian|ubuntu|raspbian)$ ]]; then
      echo "Jellyfin's installer will ask for the base distribution: enter 'debian', then the release 'trixie'."
    fi
    if ! $DRY_RUN; then
      $SUDO env SKIP_CONFIRM=1 bash "$script" || status=$?
      if [[ ${status:-0} -ne 0 ]]; then
        warn "Jellyfin installation script failed with exit code $status. This may be due to architecture or OS incompatibility."
        die "Jellyfin installation failed. Try manually with: bash '$script'"
      fi
    else
      run $SUDO env SKIP_CONFIRM=1 bash "$script"
    fi
    rm -f "$script"
  fi
  add_summary "Media Library      http://127.0.0.1:8096  (finish the setup wizard in the browser)"
}

install_cyberchef() {
  log "Installing CyberChef"
  local dir="$INSTALL_ROOT/cyberchef" zip url retries=0 max_retries=3
  run mkdir -p "$dir"
  if $DRY_RUN; then
    echo "[dry-run] download and unpack the latest CyberChef release into $dir"
  else
    while [[ $retries -lt $max_retries ]]; do
      url="$(curl -fsS https://api.github.com/repos/gchq/CyberChef/releases/latest \
        | python3 -c 'import json,sys; print(next(a["browser_download_url"] for a in json.load(sys.stdin)["assets"] if a["name"].endswith(".zip")))')" || {
        warn "Failed to fetch CyberChef release info (attempt $((retries + 1))/$max_retries)"
        ((retries++))
        continue
      }
      zip="$(mktemp)"
      if curl -fsSL --retry 5 --connect-timeout 30 "$url" -o "$zip"; then
        if unzip -t "$zip" >/dev/null 2>&1; then
          break
        else
          warn "CyberChef zip archive is corrupted (attempt $((retries + 1))/$max_retries)"
          rm -f "$zip"
          ((retries++))
          continue
        fi
      else
        warn "Failed to download CyberChef (attempt $((retries + 1))/$max_retries)"
        rm -f "$zip"
        ((retries++))
        continue
      fi
    done
    [[ $retries -lt $max_retries ]] || die "Failed to download valid CyberChef after $max_retries attempts."
    rm -rf "$dir/site"
    mkdir -p "$dir/site"
    unzip -q -o "$zip" -d "$dir/site"
    rm -f "$zip"
    local page
    page="$(find "$dir/site" -maxdepth 1 -name 'CyberChef_v*.html' | head -n1)"
    [[ -n "$page" ]] || die "CyberChef release has no HTML page."
    cp "$page" "$dir/site/index.html"
  fi
  install_service cyberchef "CyberChef" \
    "$(system_python) -m http.server 8083 --bind $BIND --directory $dir/site"
  add_summary "Data Tools         http://127.0.0.1:8083"
}

install_meshtastic() {
  log "Installing Meshtastic Web"
  local dir="$INSTALL_ROOT/meshtastic-web" tarball retries=0 max_retries=3
  run mkdir -p "$dir"
  if $DRY_RUN; then
    echo "[dry-run] download and unpack the latest Meshtastic Web release into $dir"
  else
    tarball="$(mktemp)"
    while [[ $retries -lt $max_retries ]]; do
      if curl -fsSL --retry 5 --connect-timeout 30 --max-time 120 https://github.com/meshtastic/web/releases/latest/download/build.tar -o "$tarball"; then
        if tar -tf "$tarball" >/dev/null 2>&1; then
          break
        else
          warn "Meshtastic tarball is corrupted (attempt $((retries + 1))/$max_retries)"
          ((retries++))
          continue
        fi
      else
        warn "Failed to download Meshtastic Web (attempt $((retries + 1))/$max_retries)"
        ((retries++))
        continue
      fi
    done
    [[ $retries -lt $max_retries ]] || die "Failed to download valid Meshtastic Web after $max_retries attempts."
    rm -rf "$dir/site"
    mkdir -p "$dir/site"
    tar -xf "$tarball" -C "$dir/site"
    rm -f "$tarball"
    find "$dir/site" -name '*.gz' -exec gunzip -f {} +
    [[ -f "$dir/site/index.html" ]] || die "Meshtastic Web release has no index.html."
  fi
  install_service meshtastic "Meshtastic Web" \
    "$(system_python) -m http.server 8450 --bind $BIND --directory $dir/site"
  add_summary "Mesh Communications http://127.0.0.1:8450  (radio needs Meshtastic hardware; Bluetooth/serial need a Chromium-based browser)"
}

run_app() {
  local app="$1" status=0
  # A failing app must not stop the rest. The subshell isolates `die`, and errexit must be
  # enabled inside it without an `if`/`||` around the call, which would silently disable it.
  set +e
  ( set -e; "install_$app" )
  status=$?
  set -e
  if [[ $status -ne 0 ]]; then
    FAILED+=("$app")
    warn "$app failed to install. Continuing with the remaining apps."
  fi
}

print_summary() {
  log "Done"
  local line
  if [[ -f "$STATE_DIR/summary" ]]; then
    while IFS= read -r line; do echo "  $line"; done <"$STATE_DIR/summary"
  fi
  if [[ -f "$STATE_DIR/admin" ]]; then
    echo; echo "  $(cat "$STATE_DIR/admin")"
  fi
  if [[ -f "$STATE_DIR/manual" ]]; then
    echo
    echo "systemd is not running here, so these were NOT started. Run them yourself:"
    while IFS= read -r line; do echo "  $line"; done <"$STATE_DIR/manual"
  fi
  echo
  echo "Not installed automatically: Offline Maps (needs your own map data and server) and Notes"
  echo "(FlatNotes recommends Docker). Add their addresses under Configure services in the dashboard."
  if [[ ${#FAILED[@]} -gt 0 ]]; then
    echo
    local failed_apps
    failed_apps="$(IFS=,; echo "${FAILED[*]}")"
    echo "These failed and can be retried with: bash setup.sh --apps $failed_apps"
    printf '  %s\n' "${FAILED[@]}"
    return 1
  fi
}

main() {
  normalize_apps
  check_platform
  confirm
  setup_sudo
  install_base

  local app
  for app in $ALL_APPS; do
    if wants "$app"; then
      run_app "$app"
    fi
  done
  print_summary
}

# Sourcing the file (for tests) loads the functions without installing anything.
if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  main
fi
