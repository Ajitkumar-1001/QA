#!/bin/bash
# THROWAWAY spike probe B: Chromium inside Vercel Sandbox, driven from the host.
set -u
cd "$(dirname "$0")"
PW=1.65.0
NAME=qf-spike-b
t() { date +%s; }
s=$(t)
vercel sandbox create --name $NAME --non-persistent --timeout 20m --vcpus 2 -p 3000 < /dev/null 2>&1 | tail -4
echo "create: $(( $(t) - s ))s"

s=$(t)
vercel sandbox exec --sudo $NAME -- bash -c "cd /tmp && npx -y playwright@$PW install --with-deps chromium > /tmp/install.log 2>&1; echo exit=\$?; tail -5 /tmp/install.log" < /dev/null 2>&1 | tail -8
echo "install: $(( $(t) - s ))s"
vercel sandbox exec $NAME -- bash -c 'du -sh ~/.cache/ms-playwright /root/.cache/ms-playwright 2>/dev/null' < /dev/null 2>&1 | tail -3

# Playwright run-server exposes a websocket the host can connect to.
vercel sandbox exec $NAME -- bash -c "cd /tmp && (setsid nohup npx -y playwright@$PW run-server --port 3000 --host 0.0.0.0 > /tmp/server.log 2>&1 &) ; sleep 8; cat /tmp/server.log; ss -ltnp | grep 3000" < /dev/null 2>&1 | tail -6
