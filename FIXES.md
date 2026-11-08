# Installation Failure Fixes

This document outlines the fixes applied to `setup.sh` to address the installation failures encountered on Orange Pi Zero 4.

## Issues Identified and Fixed

### 1. **Jellyfin Segmentation Fault**
**Problem:** The Jellyfin installer script from `repo.jellyfin.org` causes a segmentation fault on ARM hardware (Orange Pi Zero 4, armhf architecture). The script exits with a crash without proper error handling.

**Root Cause:** Jellyfin's official installer may not be fully compatible with all ARM variants, or may require specific system resources not available on resource-constrained devices.

**Fix Applied:**
- Added explicit error handling in `install_jellyfin()` to catch non-zero exit codes from the installer script
- Added informative warning messages when installation fails
- Changed from silently failing to providing clear error messages and instructions
- The script now exits with a diagnostic message instead of silently continuing

```bash
if ! $DRY_RUN; then
  $SUDO env SKIP_CONFIRM=1 bash "$script" || status=$?
  if [[ ${status:-0} -ne 0 ]]; then
    warn "Jellyfin installation script failed with exit code $status. This may be due to architecture or OS incompatibility."
    die "Jellyfin installation failed. Try manually with: bash '$script'"
  fi
fi
```

### 2. **CyberChef Bad CRC Errors**
**Problem:** The downloaded CyberChef zip file had corrupted WASM files with mismatched CRC checksums. This typically indicates:
- Incomplete/partial download
- Network interruption during transfer
- Corrupted file in CDN cache

**Root Cause:** Original script had no validation of downloaded files and only 3 retries with no per-attempt retry delays.

**Fix Applied:**
- Enhanced `download()` function to retry up to 3 times with 5-second delays between attempts
- Added longer timeout (120 seconds) and retry settings for curl
- Added file validation for archives:
  - CyberChef: Test zip file integrity with `unzip -t` before extracting
  - Meshtastic: Test tarball integrity with `tar -tf` before extracting
- Implement retry loops with progress reporting for both CyberChef and Meshtastic downloads
- Better error messages indicate which attempt failed and why

```bash
while [[ $retries -lt $max_retries ]]; do
  if curl -fsSL --retry 5 --connect-timeout 30 "$url" -o "$zip"; then
    if unzip -t "$zip" >/dev/null 2>&1; then
      break
    else
      warn "CyberChef zip archive is corrupted (attempt $((retries + 1))/$max_retries)"
      rm -f "$zip"
      ((retries++))
      continue
    fi
  fi
done
```

### 3. **Dashboard Installation Failures**
**Problem:** `install.sh` execution could fail without proper error detection, causing the dashboard installation to proceed despite incomplete setup.

**Fix Applied:**
- Added explicit error checking: `run sh "$SCRIPT_DIR/install.sh" || die "..."`
- Added error handling for admin password setup
- Script now stops immediately on dashboard installation failure with clear message

### 4. **Open WebUI Installation Failures**
**Problem:** Python venv creation or package installation could fail silently, leaving an incomplete installation.

**Root Cause:** No intermediate error checking between dependency steps, making it unclear where failures occur.

**Fix Applied:**
- Added explicit error handling for each step:
  - Python3 availability check
  - Venv creation validation
  - uv package manager installation validation
  - open-webui package installation validation
- Each step includes a clear `|| die` clause with specific error message

```bash
run python3 -m venv "$dir/uv-env" || die "Failed to create Python venv for uv."
run "$dir/uv-env/bin/pip" install --quiet --upgrade uv || die "Failed to install uv."
```

### 5. **Kolibri Installation Failures**
**Problem:** Similar to Open WebUI, Python dependencies could fail without proper error detection.

**Fix Applied:**
- Added Python3 availability check
- Added validation for each venv and pip operation
- Clear error messages indicate which step failed

### 6. **Generic Download Function Improvements**
**Problem:** Generic `download()` function had insufficient retry logic and no inter-attempt delays.

**Fix Applied:**
- Implemented proper retry loop with maximum retry limit
- Added 5-second delays between failed attempts
- Longer timeout windows (15s connect, 120s max time)
- Function now dies with clear error message after all retries exhausted
- Better warning messages during retry attempts

## Testing Recommendations

To test these fixes:

```bash
# Test with problematic apps only
bash setup.sh --apps jellyfin cyberchef openwebui kolibri dashboard

# Test with dry-run first
bash setup.sh --apps jellyfin cyberchef openwebui kolibri dashboard --dry-run

# Test with all apps
bash setup.sh --yes
```

## Expected Behavior After Fixes

1. **Jellyfin**: If installation fails, you'll get a clear error message explaining the issue and suggesting manual installation steps
2. **CyberChef**: Will retry up to 3 times with 5-second delays if downloads fail or are corrupted
3. **Dashboard/OpenWebUI/Kolibri**: Installation failures at any step will be caught and reported clearly
4. **All network downloads**: Better retry logic with longer timeouts and inter-attempt delays

## Platform-Specific Notes

For **Orange Pi Zero 4** (armhf):
- Jellyfin may not install via the official script due to ARM architecture constraints
- Consider using Docker if native installation fails
- Other apps (Dashboard, OpenWebUI, Kolibri) should now install more reliably with the enhanced error handling

## Files Modified

- `setup.sh`: Enhanced error handling and validation across all installation functions
