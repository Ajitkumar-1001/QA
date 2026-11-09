#!/bin/bash
# THROWAWAY: install browser as the sandbox user, then drive it from the host
cd "$(dirname "$0")"
s=$(date +%s)
vercel sandbox exec qf-spike-b -- bash -c 'cd /tmp && npx -y playwright@1.65.0 install chromium > /tmp/i2.log 2>&1; echo exit=$?; du -sh ~/.cache/ms-playwright' < /dev/null 2>&1 | tail -3
echo "user-install: $(( $(date +%s) - s ))s"
cd host && node connect.mjs wss://sb-36wo1bim14hc.vercel.run/ 2>&1 | tail -5
ls -la ../out/
