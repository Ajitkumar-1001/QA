#!/bin/bash
# THROWAWAY: what can the VM reach (SSRF surface), then apply a deny policy for private ranges and re-check, then stop.
N=qf-spike-b
chk='for u in http://169.254.169.254/ http://10.0.0.1/ http://127.0.0.1:3000/ https://example.com/; do printf "%s -> " $u; curl -s -m 4 -o /dev/null -w "%{http_code}\n" $u || echo blocked; done'
echo "== allow-all"; vercel sandbox exec $N -- bash -c "$chk" < /dev/null 2>&1 | tail -4
vercel sandbox config --help 2>&1 | grep -iE 'network|cidr' | head -5
vercel sandbox config network-policy $N --denied-cidr 169.254.0.0/16 --denied-cidr 10.0.0.0/8 --allowed-domain '*' < /dev/null 2>&1 | tail -3
echo "== after deny"; vercel sandbox exec $N -- bash -c "$chk" < /dev/null 2>&1 | tail -4
vercel sandbox stop $N < /dev/null 2>&1 | tail -2
