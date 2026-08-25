# Self-hosting elab2arc

`docker compose up` gives you a fully working elab2arc with **no dependency on the
maintainer's personal `wb-e.com` proxy infrastructure** - a bundled CORS/git/LFS
proxy runs alongside the static site itself.

## Quick start

```bash
git clone https://github.com/nfdi4plants/elab2arc.git
cd elab2arc
docker compose up
```

Open **http://localhost:8080**. That's it - the app works exactly like the
hosted version at `nfdi4plants.org/elab2arc/`, just talking to your own bundled
proxy instead of the maintainer's `wb-e.com` servers for eLabFTW/GitLab/GitHub
API calls, git clone/push, and Git LFS uploads.

To run in the background: `docker compose up -d`. To stop:
`docker compose down`.

## What's bundled and why

The app is a client-side SPA that needs a CORS proxy for two things browsers
otherwise block:

1. **General API calls** (eLabFTW, GitLab, GitHub REST APIs, and Git LFS
   batch/object uploads) - handled by `docker/proxy/generic_proxy.py`, a small
   aiohttp app that forwards whatever's embedded in the URL after
   `/_corsproxy/`.
2. **Git protocol operations** (clone/fetch/push via isomorphic-git) - handled
   by a vendored, unmodified copy of
   [cors-proxy-py](https://github.com/isomorphic-git/cors-proxy) (an
   `@isomorphic-git/cors-proxy` port) at `/_gitproxy/`.

Both run in the `proxy` container; `nginx` (the `web` container) reverse-proxies
those two paths to it and serves the static site itself, same as the plain
Dockerfile always did.

The production deployment at `nfdi4plants.org/elab2arc/` (and its GitHub Pages
mirror at `nfdi4plants.github.io/elab2arc/`) is unaffected - the app detects its
own origin at load time and only uses the bundled proxy paths when it's *not*
running on one of those two known production origins.

## Security default: permissive CORS on the bundled proxy

`generic_proxy.py`'s `Access-Control-Allow-Origin` defaults to `*`
(configurable via the `GENERIC_PROXY_ALLOW_ORIGIN` environment variable in
`docker-compose.yml`). This is a deliberate choice for **single-tenant,
self-hosted infrastructure** - if you're running this for yourself, an
allowlist buys you nothing extra. The maintainer's own production `wb-e.com`
proxies instead use a strict origin allowlist because they're genuinely shared
infrastructure serving the public production app. If you're deploying this
compose stack somewhere it'll be reachable by other people/services you don't
trust, set `GENERIC_PROXY_ALLOW_ORIGIN` to your actual origin instead of
leaving it as `*`.

## Known limitations

- **No true single-image `docker run`.** This needs `docker compose up`
  (two services: `web` and `proxy`) - a bare `docker run` of just the `web`
  image serves the static site fine but the two proxy paths won't have
  anything behind them.
- **`cors-proxy-py` is vendored, not a live dependency.** `docker/proxy/vendor/cors_proxy/`
  is a byte-for-byte copy from a specific upstream commit (see
  `docker/proxy/VENDORED.md`). If that project changes, this copy needs manual
  re-syncing - it won't happen automatically.
- **Production-unchanged is verified by code inspection, not a live test** -
  there's no way to actually serve these files from `nfdi4plants.org`'s real
  origin in a local test, so the origin-detection branch that keeps
  production on the real `wb-e.com` proxies is confirmed by reading the code,
  not by an end-to-end run against production itself.

See `docker/TODOs.md` for the full design writeup, including two real bugs
that only showed up in a genuine browser end-to-end test (real Chrome sends
`Accept-Encoding: br, zstd` by default, which needed extra Python packages to
decode) - useful context if you're modifying `generic_proxy.py`.
