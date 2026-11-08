#!/usr/bin/env bash
# Native macOS companion to setup.sh. Run this again to retry selected apps.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Reuse the Linux installer's option handling and platform-independent installers.
OFFGRID_SETUP_SCRIPT=macos-apps.sh
source "$SCRIPT_DIR/setup.sh"

check_platform() {
  [[ "$(uname -s)" == Darwin ]] || die "This installer requires macOS."
  [[ $EUID -ne 0 ]] || die "Run as your normal user, not root."
  local major
  major="$(sw_vers -productVersion | cut -d. -f1)"
  [[ "$major" =~ ^[0-9]+$ && "$major" -ge 13 ]] || die "macOS Ventura (13) or later is required."
}

setup_sudo() { :; }

confirm() {
  $ASSUME_YES && return 0
  $DRY_RUN && return 0
  printf '\nThis will install: %s\nFiles and data: %s\n' "$APPS" "$INSTALL_ROOT"
  echo "Homebrew may request administrator access; models and offline content can require several GB."
  [[ -t 0 ]] || die "Not running in a terminal. Re-run with --yes to confirm."
  read -rp "Continue? [Y/n] " answer
  [[ ! "$answer" =~ ^[Nn] ]] || exit 0
}

install_base() {
  if [[ "$APPS" == dashboard ]]; then return; fi
  if ! command -v brew >/dev/null 2>&1; then
    for candidate in /opt/homebrew/bin/brew /usr/local/bin/brew; do
      if [[ -x "$candidate" ]]; then
        PATH="$(dirname "$candidate"):$PATH"
        export PATH
        break
      fi
    done
  fi
}

require_brew() {
  if ! command -v brew >/dev/null 2>&1; then
    $DRY_RUN && return 0
    die "Homebrew is required for $1. Install it from https://brew.sh/ and rerun."
  fi
}

install_python() {
  if [[ -n "${MAC_PYTHON:-}" ]]; then return; fi
  run brew install python@3.12
  if $DRY_RUN; then
    MAC_PYTHON=python3.12
  else
    MAC_PYTHON="$(brew --prefix python@3.12)/bin/python3.12"
    [[ -x "$MAC_PYTHON" ]] || die "Homebrew Python 3.12 was not found at $MAC_PYTHON."
  fi
}

launch_agent() {
  local name="$1"
  shift
  local label="org.offgrid-madhat.$name"
  local plist="$HOME/Library/LaunchAgents/$label.plist"
  local logs="$INSTALL_ROOT/logs"
  if $DRY_RUN; then
    printf '[dry-run] launchd %s:' "$label"
    printf ' %q' "$@"
    printf '\n'
    return
  fi
  mkdir -p "$(dirname "$plist")" "$logs"
  # plistlib preserves spaces and special characters in paths and arguments.
  /usr/bin/python3 -c '
import plistlib, sys
path, label, workdir, logs, *args = sys.argv[1:]
with open(path, "wb") as f:
    plistlib.dump({"Label": label, "ProgramArguments": args, "WorkingDirectory": workdir,
                  "RunAtLoad": True, "KeepAlive": {"SuccessfulExit": False},
                  "StandardOutPath": logs + "/" + label + ".log",
                  "StandardErrorPath": logs + "/" + label + ".err.log"}, f)
' "$plist" "$label" "$SCRIPT_DIR" "$logs" "$@"
  local domain="gui/$(id -u)"
  if launchctl print "$domain/$label" >/dev/null 2>&1; then
    launchctl bootout "$domain/$label"
  fi
  launchctl bootstrap "$domain" "$plist"
  launchctl kickstart "$domain/$label"
}

# setup.sh's platform-independent installers call this function after installation.
install_service() {
  local name="$1"
  case "$name" in
    dashboard)
      launch_agent "$name" /usr/bin/env "OFFGRID_HOST=$BIND" OFFGRID_PORT=4173 \
        "$(command -v node)" "$SCRIPT_DIR/server.mjs" ;;
    openwebui)
      launch_agent "$name" /usr/bin/env "DATA_DIR=$INSTALL_ROOT/open-webui/data" \
        OLLAMA_BASE_URL=http://127.0.0.1:11434 "$INSTALL_ROOT/open-webui/venv/bin/open-webui" serve --host "$BIND" --port 8080 ;;
    kolibri)
      launch_agent "$name" /usr/bin/env "KOLIBRI_HOME=$INSTALL_ROOT/kolibri/data" \
        "KOLIBRI_LISTEN_ADDRESS=$BIND" "$INSTALL_ROOT/kolibri/venv/bin/kolibri" start --foreground --port 8082 ;;
    cyberchef|meshtastic)
      local port dir
      if [[ "$name" == cyberchef ]]; then port=8083; dir=cyberchef; else port=8450; dir=meshtastic-web; fi
      launch_agent "$name" "$MAC_PYTHON" -m http.server "$port" --bind "$BIND" --directory "$INSTALL_ROOT/$dir/site" ;;
    *) die "Unsupported macOS service: $name" ;;
  esac
}

install_openwebui() {
  install_python
  PATH="$(dirname "$MAC_PYTHON"):$PATH"
  # setup.sh uses python3 for its uv bootstrap.
  local dir="$INSTALL_ROOT/open-webui"
  run mkdir -p "$dir/data"
  run "$MAC_PYTHON" -m venv "$dir/uv-env"
  run "$dir/uv-env/bin/pip" install --quiet --upgrade uv
  run "$dir/uv-env/bin/uv" venv --python 3.12 --allow-existing "$dir/venv"
  run "$dir/uv-env/bin/uv" pip install --python "$dir/venv/bin/python" --upgrade open-webui
  install_service openwebui
  add_summary "AI Assistant       http://127.0.0.1:8080 (create the first account in the browser)"
}

install_kolibri() {
  install_python
  local dir="$INSTALL_ROOT/kolibri"
  run mkdir -p "$dir/data"
  run "$MAC_PYTHON" -m venv "$dir/venv"
  run "$dir/venv/bin/pip" install --quiet --upgrade pip kolibri
  install_service kolibri
  add_summary "Education Platform http://127.0.0.1:8082 (finish the setup wizard)"
}

install_ollama() {
  log "Installing Ollama"
  run brew install ollama
  local binary
  if $DRY_RUN; then binary=ollama; else binary="$(brew --prefix)/bin/ollama"; fi
  launch_agent ollama "$binary" serve
  if [[ -n "${OLLAMA_MODEL:-}" ]]; then
    if $DRY_RUN; then
      echo "[dry-run] ollama pull $OLLAMA_MODEL"
    else
      local attempt
      for attempt in {1..30}; do
        curl -fsS http://127.0.0.1:11434/api/tags >/dev/null 2>&1 && break
        sleep 1
      done
      curl -fsS http://127.0.0.1:11434/api/tags >/dev/null ||
        die "Ollama did not start; inspect $INSTALL_ROOT/logs and retry."
      "$binary" pull "$OLLAMA_MODEL"
    fi
  else
    echo "No model downloaded. Run: ollama pull llama3.2:1b"
  fi
  add_summary "Ollama             http://127.0.0.1:11434"
}

install_jellyfin() {
  log "Installing Jellyfin"
  run brew install --cask jellyfin
  launch_agent jellyfin /usr/bin/open -a Jellyfin
  add_summary "Media Library      http://127.0.0.1:8096 (finish the Jellyfin setup wizard)"
}

install_kiwix() {
  log "Installing Kiwix"
  run brew install --cask kiwix
  local dir="$INSTALL_ROOT/kiwix/library"
  run mkdir -p "$dir"
  if [[ -n "${KIWIX_ZIM_URL:-}" ]]; then
    case "$KIWIX_ZIM_URL" in
      https://*.zim|http://*.zim) ;;
      *) die "KIWIX_ZIM_URL must be a direct http(s) link to a .zim file." ;;
    esac
    run curl -fL --retry 3 --connect-timeout 15 -C - -o "$dir/$(basename "$KIWIX_ZIM_URL")" "$KIWIX_ZIM_URL"
  fi
  add_summary "Kiwix desktop installed; open Kiwix and import ZIM files from $dir."
  add_summary "The desktop app does not provide the dashboard's Kiwix web service; configure a separate Kiwix server for that tile."
}

# The shared static-site installers need a Python interpreter for their launch agents.
install_static_app() {
  install_python
  "install_$1"
}

print_macos_summary() {
  log "Done"
  [[ ! -f "$STATE_DIR/summary" ]] || while IFS= read -r line; do echo "  $line"; done <"$STATE_DIR/summary"
  [[ ! -f "$STATE_DIR/admin" ]] || printf '\n  %s\n' "$(cat "$STATE_DIR/admin")"
  echo
  echo "launchd services run while this user is logged in; logs are in $INSTALL_ROOT/logs."
  echo "Maps and Notes are not installed automatically. Ollama models and offline content must be downloaded separately."
  if [[ ${#FAILED[@]} -gt 0 ]]; then
    local failed_list
    failed_list="$(IFS=,; echo "${FAILED[*]}")"
    echo "Failed apps: $failed_list"
    echo "Retry with: bash macos-apps.sh --apps $failed_list"
    return 1
  fi
}

main_macos() {
  normalize_apps
  check_platform
  confirm
  install_base
  mkdir -p "$STATE_DIR"
  local app status
  for app in $ALL_APPS; do
    if wants "$app"; then
      set +e
      if [[ "$app" == cyberchef || "$app" == meshtastic ]]; then
        ( set -e; require_brew "$app"; install_static_app "$app" )
      elif [[ "$app" == dashboard ]]; then
        ( set -e; install_dashboard )
      else
        ( set -e; require_brew "$app"; "install_$app" )
      fi
      status=$?
      set -e
      if [[ $status -ne 0 ]]; then
        FAILED+=("$app")
        warn "$app failed to install. Continuing with the remaining apps."
      fi
    fi
  done
  print_macos_summary
}

main_macos
