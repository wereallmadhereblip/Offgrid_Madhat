#!/bin/sh
set -eu

fail() {
  printf 'Error: %s\n' "$*" >&2
  exit 1
}

[ "$(uname -s)" = Darwin ] || fail 'This setup script is for macOS only.'
mac_major=$(sw_vers -productVersion | cut -d. -f1)
case "$mac_major" in
  ''|*[!0-9]*) fail 'Could not determine the macOS version.' ;;
esac
[ "$mac_major" -ge 13 ] || fail 'macOS Ventura (13) or later is required.'

case "$(uname -m)" in
  arm64|x86_64) ;;
  *) fail 'This installer supports Apple silicon and Intel Macs only.' ;;
esac

destination=Offgrid_Madhat
case "${1:-}" in
  ''|--*|-y|-h) ;;
  *) destination=$1; shift ;;
esac
[ ! -e "$destination" ] && [ ! -L "$destination" ] ||
  fail "Destination already exists: $destination. Choose another destination; existing files will not be changed."

git_path=$(command -v git || true)
if [ -z "$git_path" ] || { [ "$git_path" = /usr/bin/git ] && ! xcode-select -p >/dev/null 2>&1; }; then
  [ -t 0 ] || fail 'Git is missing. Run this script in Terminal to install Apple Command Line Tools.'
  printf '%s\n' 'Git requires Apple Command Line Tools. Approve the installation in the macOS dialog.'
  xcode-select --install || fail 'Could not start the Command Line Tools installer. Finish any pending installation and rerun.'
  printf '%s' 'After the installation finishes, press Return to continue: '
  read -r answer || fail 'No confirmation received. Finish installing Command Line Tools and rerun.'
fi
command -v git >/dev/null 2>&1 && git --version ||
  fail 'Git is not available. Finish installing Apple Command Line Tools and rerun.'

node_ready() {
  command -v node >/dev/null 2>&1 && command -v npm >/dev/null 2>&1 || return 1
  node_major=$(node -p 'Number(process.versions.node.split(".")[0])') || return 1
  npm_major=$(npm --version | cut -d. -f1) || return 1
  case "$node_major:$npm_major" in
    *[!0-9:]*|:*|*:) return 1 ;;
  esac
  [ "$node_major" -ge 20 ] && [ "$npm_major" -ge 7 ]
}

if ! node_ready; then
  printf '%s\n' 'Installing the latest Node.js 22 release from nodejs.org (requires administrator access).'
  temp_dir=$(mktemp -d "${TMPDIR:-/tmp}/offgrid-node.XXXXXXXX") || fail 'Could not create a temporary directory.'
  trap 'rm -rf "$temp_dir"' EXIT
  trap 'exit 1' HUP INT TERM
  base_url=https://nodejs.org/dist/latest-v22.x
  curl -fsSL "$base_url/SHASUMS256.txt" -o "$temp_dir/SHASUMS256.txt" ||
    fail 'Could not download Node.js checksums.'
  package=$(awk '$2 ~ /^node-v22\.[0-9]+\.[0-9]+\.pkg$/ { print $2; exit }' "$temp_dir/SHASUMS256.txt")
  [ -n "$package" ] || fail 'Could not find a Node.js 22 macOS installer in the checksum list.'
  curl -fsSL "$base_url/$package" -o "$temp_dir/$package" || fail 'Could not download the Node.js installer.'
  (cd "$temp_dir" && grep "  $package\$" SHASUMS256.txt | shasum -a 256 -c -) ||
    fail 'The Node.js installer checksum did not match.'
  sudo installer -pkg "$temp_dir/$package" -target / || fail 'Node.js installation failed.'
  PATH="/usr/local/bin:$PATH"
  export PATH
  hash -r
  node_ready || fail 'Node.js 20+ and npm 7+ are still unavailable. Check your PATH and rerun.'
  printf '%s\n' 'If your terminal uses an older Node.js, put /usr/local/bin before it in PATH.'
fi

printf 'Node.js: %s\nnpm: %s\n' "$(node --version)" "$(npm --version)"
git clone https://github.com/wereallmadhereblip/Offgrid_Madhat.git "$destination"
(cd "$destination" && bash macos-apps.sh "$@")
