#!/bin/sh
# Runs both proxy roles as two independent processes in one container.
#
# Originally tried mounting both as aiohttp sub-applications on one port
# (see git history / docker/TODOs.md) - that broke the git-proxy role: aiohttp
# subapp mounting only affects *routing* (which handler matches), it does NOT
# rewrite request.path for the matched handler, and the vendored cors-proxy-py
# reads request.path directly (not route-relative match_info) to parse the
# target domain out of the URL. Mounted under a prefix, it therefore saw the
# mount prefix itself as the target domain and tried to connect to a host
# named "_gitproxy" - confirmed via the exact DNS-resolution error in the logs
# during phase (e) verification, not assumed.
#
# Two standalone processes on two ports instead, with nginx (docker/web/nginx.conf)
# doing the prefix-stripping via the standard proxy_pass-with-trailing-slash
# convention - that's the layer whose actual job this is, and it sidesteps the
# request.path-vs-match_info distinction entirely for both proxies.
set -e

PORT=9999 python3 -m cors_proxy.server &
GITPROXY_PID=$!

PORT=9998 python3 generic_proxy.py &
GENERIC_PID=$!

trap 'kill $GITPROXY_PID $GENERIC_PID 2>/dev/null' TERM INT

wait $GITPROXY_PID $GENERIC_PID
