#!/bin/sh
# Offline portfolio + strategy regression suite. No network, credentials or database.
status=0
for f in scripts/test-strategy-s1-a-terminology.mjs scripts/test-strategy-s1-b-navigation.mjs \
  scripts/test-strategy-s1-c-reliability.mjs scripts/test-strategy-s1-d-data-quality.mjs \
  scripts/test-strategy-s2-b-canonical-read.mjs scripts/test-portfolio-qa-integration.mjs; do
  [ -f "$f" ] || continue
  if out=$(node "$f" 2>&1); then printf '%s: %s\n' "$f" "$(printf '%s\n' "$out" | tail -1)"
  else status=1; printf '%s: FAIL\n%s\n' "$f" "$(printf '%s\n' "$out" | grep -E 'Error|actual:|expected:|at file' | head -6)"; fi
done
for f in scripts/project-portfolio.test.mjs scripts/qa-portfolio-register.test.mjs; do
  if out=$(node --test "$f" 2>&1); then printf '%s: %s\n' "$f" "$(printf '%s\n' "$out" | grep -E '^(#|ℹ) (pass|fail) ' | tr '\n' ' ')"
  else status=1; printf '%s: FAIL\n%s\n' "$f" "$(printf '%s\n' "$out" | grep -E 'not ok|Error|ENOENT|expected|actual' | head -8)"; fi
done
exit $status
