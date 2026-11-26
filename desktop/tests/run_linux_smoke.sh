#!/usr/bin/env bash
set -euo pipefail
# Create disposable XDG directories, a fresh DBus session and a headless display.
# This finite test runner is not a daemon or scheduled automation.
if [[ "${1:-}" != "--isolated-session" ]]; then
  temporary="$(mktemp -d -t mynotes-smoke.XXXXXXXX)"
  trap 'rm -rf "$temporary"' EXIT
  export XDG_DATA_HOME="$temporary/data"
  export XDG_CONFIG_HOME="$temporary/config"
  export XDG_CACHE_HOME="$temporary/cache"
  export XDG_RUNTIME_DIR="$temporary/runtime"
  export MYNOTES_DISPOSABLE_SMOKE=1
  export WEBKIT_DISABLE_COMPOSITING_MODE=1
  mkdir -p "$XDG_DATA_HOME" "$XDG_CONFIG_HOME" "$XDG_CACHE_HOME" "$XDG_RUNTIME_DIR"
  chmod 700 "$temporary" "$XDG_RUNTIME_DIR"
  unset GNOME_KEYRING_CONTROL DBUS_SESSION_BUS_ADDRESS
  xvfb-run -a -s '-screen 0 1440x1000x24' dbus-run-session -- bash "$(realpath "$0")" --isolated-session "$@"
  exit $?
fi
shift
[[ "${MYNOTES_DISPOSABLE_SMOKE:-}" == 1 ]] || { echo 'Refusing non-disposable session.' >&2; exit 1; }
# The password belongs only to this temporary test keyring, not a user account.
printf '%s' 'mynotes-disposable-smoke-keyring' | gnome-keyring-daemon --unlock --components=secrets --control-directory "$XDG_RUNTIME_DIR/keyring" >/dev/null
# Verify Secret Service availability without reading any credential values.
gdbus call --session --dest org.freedesktop.secrets --object-path /org/freedesktop/secrets --method org.freedesktop.DBus.Peer.Ping >/dev/null
python3 "$(dirname "$(realpath "$0")")/native_smoke.py" "$@"
