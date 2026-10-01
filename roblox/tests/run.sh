#!/usr/bin/env bash
# Runs the pure-Luau tests with the standalone `luau` runtime.
# usage: LUAU=/path/to/luau tests/run.sh
set -euo pipefail
cd "$(dirname "$0")/.."
LUAU="${LUAU:-luau}"
tmp="$(mktemp -d)"
for t in tests/*.test.luau; do
  echo "== $t"
  node tests/bundle.mjs "$t" > "$tmp/bundle.luau"
  "$LUAU" "$tmp/bundle.luau"
done
rm -rf "$tmp"
