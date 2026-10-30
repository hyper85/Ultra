#!/usr/bin/env bash
# Every test suite in one go – the weekly scan runs this. Builds the app twice (plain on :4174, with a same-origin dummy
# Supabase on :4175 for the login/Strava/Garmin tests), starts both previews, runs each suite, prints a summary and
# exits non-zero when any suite fails. Usage: bash scripts/test-all.sh   (OUT=dir keeps the logs there)
set -u
cd "$(dirname "$0")/.."
OUT="${OUT:-$(mktemp -d)}"; mkdir -p "$OUT"; rm -f "$OUT/failures.txt"
[ -x node_modules/.bin/vite ] || npm ci --silent
node scripts/i18n-check.mjs > "$OUT/i18n.log" 2>&1; I18N=$?
npx vite build > "$OUT/build.log" 2>&1 || { echo "BUILD FAILED"; tail -20 "$OUT/build.log"; exit 1; }
VITE_SUPABASE_URL=http://localhost:4175/sb VITE_SUPABASE_ANON_KEY=anon npx vite build --outDir "$OUT/dist-auth" --emptyOutDir > "$OUT/build-auth.log" 2>&1 || { echo "AUTH BUILD FAILED"; exit 1; }
pkill -f "^node .*vite preview --port 417[45]" 2>/dev/null; sleep 1
# Background servers can be stopped by the environment; check before every suite and start what is missing.
ensure_servers() {
  curl -s -o /dev/null http://localhost:4174/ || (setsid nohup npx vite preview --port 4174 --strictPort >> "$OUT/preview.log" 2>&1 &)
  curl -s -o /dev/null http://localhost:4175/ || (setsid nohup npx vite preview --port 4175 --strictPort --outDir "$OUT/dist-auth" >> "$OUT/preview-auth.log" 2>&1 &)
  for i in $(seq 1 30); do curl -s -o /dev/null http://localhost:4174/ && curl -s -o /dev/null http://localhost:4175/ && return 0; sleep 1; done
  echo "preview servers did not start"; return 1
}
ensure_servers || exit 1
fail=0; summary=""
for f in tests/*.mjs; do
  name=$(basename "$f" .mjs)
  case "$name" in seed|shots|shots-*) continue;; esac
  ensure_servers > /dev/null
  timeout 600 node "$f" > "$OUT/$name.log" 2>&1
  if grep -q "ALL PASS" "$OUT/$name.log"; then summary+="  PASS  $name"$'\n'; else summary+="  FAIL  $name"$'\n'; fail=1; grep -E "^FAIL|Error" "$OUT/$name.log" | head -5 | sed 's/^/          /' >> "$OUT/failures.txt"; fi
done
pkill -f "^node .*vite preview --port 417[45]" 2>/dev/null
echo "i18n: $(tail -2 "$OUT/i18n.log" | tr '\n' ' ')"; [ $I18N -eq 0 ] || fail=1
printf "%s" "$summary"
[ -f "$OUT/failures.txt" ] && { echo "Failures:"; cat "$OUT/failures.txt"; }
echo "logs: $OUT"
exit $fail
