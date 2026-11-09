#!/bin/bash
# THROWAWAY spike probe A: does Vercel Sandbox start on the Hobby team?
cd "$(dirname "$0")"
start=$(date +%s)
vercel sandbox run --rm --non-persistent --timeout 3m --vcpus 1 -- \
  bash -c 'uname -a; . /etc/os-release; echo "$PRETTY_NAME"; node -v; nproc; free -m | head -2' < /dev/null 2>&1 | tail -20
echo "elapsed: $(( $(date +%s) - start ))s"
