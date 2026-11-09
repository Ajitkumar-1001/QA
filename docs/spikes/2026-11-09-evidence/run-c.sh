#!/bin/bash
# THROWAWAY: run probe C as separate OS processes: start (suspend) -> status -> resume -> resume again (double-resume check)
cd "$(dirname "$0")"
out=$(node probe-c.mjs start 2>&1 | tail -1); echo "start:   $out"
id=$(echo "$out" | sed -E 's/.*"runId":"([^"]+)".*/\1/')
echo "status:  $(node probe-c.mjs status "$id" 2>&1 | tail -1)"
echo "resume:  $(node probe-c.mjs resume "$id" 2>&1 | tail -1)"
echo "status:  $(node probe-c.mjs status "$id" 2>&1 | tail -1)"
echo "resume2: $(node probe-c.mjs resume "$id" 2>&1 | tail -2 | tr '\n' ' ')"
