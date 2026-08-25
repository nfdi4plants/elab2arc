# Self-contained Docker deployment — plan

Goal: `docker compose up` (or equivalent) on this repo gives a fully working elab2arc with
**zero dependency on the maintainer's personal `wb-e.com` infrastructure**. Production
(`nfdi4plants.org/elab2arc/`, GitHub Pages, deployed by pushing to `origin/main` per `CLAUDE.md`)
must keep using the real `wb-e.com` proxies, unchanged, from the exact same static files.

## Findings from research (verify claims below by reading the code, don't re-derive)

1. **Two proxy roles, not three** — confirmed. `proxyConfig.corsProxy` (general REST API calls,
   also reused for LFS via 3 duplicated `'https://proxy.wb-e.com'` literals) and
   `proxyConfig.gitProxy` (isomorphic-git clone/fetch/push). Full literal-occurrence list (grepped
   `wb-e\.com` across all of `js/`):
   - `js/elab2arc-core20260504.js:83-91` — the `proxyConfig` object (6 literals: primary/backup/
     current × corsProxy/gitProxy)
   - `js/elab2arc-core20260504.js:2793` and `:5886` — two `const lfsProxy = 'https://proxy.wb-e.com'`
   - `js/modules/git-lfs-service.js:16` — `const LFS_UPLOAD_PROXY = 'https://proxy.wb-e.com'`

2. **`cors-proxy-py` is NOT a drop-in for the generic CORS+LFS role — verified by reading its
   source, not assumed.** Two concrete incompatibilities:
   - `cors_proxy/middleware.py`'s `create_proxy_middleware` gates every request through
     `allow_request.py`'s `allow()`, which returns `True` only for literal git-protocol shapes
     (`info/refs` with `service=git-upload-pack|git-receive-pack`, `git-upload-pack`,
     `git-receive-pack` POST bodies, and their OPTIONS preflights). Anything else — including
     eLabFTW REST calls, GitLab REST calls, and the LFS batch/object endpoints elab2arc actually
     uses — falls through to `root_handler`, which returns a bare `403` for any non-`/` path.
   - Its `parse_path()` expects a **bare-domain** path shape (`/{domain}/{rest}`, no scheme —
     matching isomorphic-git's own internal `corsProxy` convention, which strips the scheme before
     appending). elab2arc's manual `fetchWithProxyFallback()`/LFS code instead does
     `corsProxy + url` where `url` already **includes its own `https://` scheme**
     (e.g. `.../https://elab.dataplan.top/api/v2/users`). Traced `parse_path`'s regex
     (`/([^/]+)/(.*)`) against that shape: it captures `domain="https:"`, and reconstructing
     `f"{protocol}://{pathdomain}/{remainingpath}"` produces a malformed
     `https://https://elab.dataplan.top/...` URL. Confirmed by manual trace, not run against a
     live instance (not worth standing one up just to watch it 400) - **treat as needing a real
     smoke test in phase (e), since this table-traced conclusion could still be wrong in a detail.**
   - Conclusion: **use `cors-proxy-py` unmodified for the git-proxy role only** (isomorphic-git's
     own convention already matches it exactly — no changes needed there). Write a **new, separate,
     much simpler generic proxy** for the CORS+LFS role: no git-shape gate, parses the tail of its
     mount path as a literal already-schemed target URL, supports PUT (needed for LFS object
     upload), streams large bodies.

3. **Composition decision: docker-compose, two services, one proxy container running two
   processes.** `web` (nginx, existing `Dockerfile` plus one added config file for two
   reverse-proxy locations) and `proxy` (one container, two independent processes on two ports:
   `cors_proxy.server` unmodified on 9999 for the git-proxy role, `generic_proxy.py` on 9998 for
   the generic CORS+LFS role).
   - **Revised during phase (e): aiohttp sub-app mounting (the original plan here) does NOT work
     for the git-proxy role - confirmed empirically, not just suspected.** Mounting
     `cors_proxy.server.create_app()` as a sub-app under `/_gitproxy` produced a live DNS-resolution
     error (`Cannot connect to host _gitproxy:443`): aiohttp's `add_subapp()` only affects *routing*
     (which handler matches), it does **not** rewrite `request.path` for the matched handler - only
     route-relative `match_info` reflects the stripped prefix. `cors_proxy`'s `middleware.py` reads
     `request.path` directly (not `match_info`) to parse the target domain, so under a sub-app it
     saw the mount prefix itself (`_gitproxy`) as the target host. Fixed by dropping sub-app
     mounting entirely: two standalone processes, each its own port, with **nginx** doing the
     prefix-stripping via the standard `location /x/ { proxy_pass http://upstream/; }`
     trailing-slash convention - that's the layer whose actual job this is, and it sidesteps
     `request.path` vs `match_info` entirely for both proxies. `generic_proxy.py`'s own
     `match_info`-based tail parsing would have survived sub-app mounting fine on its own, but
     there's no reason to run two different prefix-stripping mechanisms side by side.
   - **Why not a true single `docker run` (nginx+python in one image via supervisord/s6)?**
     Considered — the user's own phrasing ("the docker image", singular) leans that way. Chose
     compose anyway: it's the standard, more maintainable pattern, still delivers "one command"
     (`docker compose up`), avoids adding a process-supervisor dependency, and keeps the existing
     verified 273MB static-site image essentially untouched rather than bolting a language runtime
     into it. **This is a judgment call, flagged explicitly per the task's ask** — revisit if the
     user wants the literal single-image experience instead.
   - Why one container for both proxy processes rather than two separate compose services?
     Marginal choice either way - kept them together (a small `entrypoint.sh` backgrounds one,
     foregrounds the other) since they share the same image/dependencies and there's no isolation
     benefit to splitting them.

4. **Client self-host-awareness:** branch `proxyConfig`'s initial values on
   `window.location.origin` at load time. Known production origins: `https://nfdi4plants.org` and
   `https://nfdi4plants.github.io` (the raw Pages URL, per `CLAUDE.md`'s Deployment section) keep
   the exact existing hardcoded `wb-e.com` values, byte-for-byte, so production behavior is
   provably unchanged. Any other origin defaults to same-origin relative paths
   (`{origin}/_corsproxy/`, `{origin}/_gitproxy`) matching the nginx locations above. The existing
   `localStorage.getItem('gitProxyURL')` override in `getGitProxy()` is untouched and still wins
   if a developer wants to point at yet another proxy.
   - Also fold the 3 duplicated LFS proxy literals into calling `getCorsProxy()` (already exists,
     defined earlier in the same file/load order allows it) instead of a separate hardcoded
     string, per the task's "should probably become one shared source of truth" note.
     `git-lfs-service.js` loads *before* `elab2arc-core...js`, so its own `LFS_UPLOAD_PROXY`
     constant can't call `getCorsProxy` at module-load time — change it from a constant to a
     function that reads `window.getCorsProxy()` lazily, at actual call time (by which point
     elab2arc-core has already loaded and run). Requires exposing `getCorsProxy` on `window` from
     elab2arc-core (currently module-scoped only).

5. **Security default:** the bundled generic proxy's CORS origin defaults to permissive
   (`Access-Control-Allow-Origin: *` equivalent, configurable via an env var) — this is
   single-tenant infra the self-hoster runs for themselves, not shared production infra, so
   zero-config "just works" wins over an allowlist. **State this explicitly in the docker README
   so nobody assumes it matches the strict allowlist the real `wb-e.com` proxies use.**

## Phases

- [x] **(a) Spec/decide** — this document.
- [x] **(b) Build the bundled proxy service**
  - [x] `docker/proxy/generic_proxy.py` — new aiohttp app: no git-shape gate, path tail parsed as
        a literal (already-schemed) target URL via `match_info`, forwards
        `Authorization`/`Content-Type`/`Accept`/`X-Requested-With`/`Accept-Encoding`/`Range`/
        `Cache-Control`, supports `GET/POST/PUT/PATCH/DELETE/OPTIONS`, raised `client_max_size` to
        1000M (match the real nginx configs), streams request and response bodies,
        `GENERIC_PROXY_ALLOW_ORIGIN` env var (default `*`).
  - [x] `docker/proxy/entrypoint.sh` — runs `cors_proxy.server` (unmodified, port 9999) and
        `generic_proxy.py` (port 9998) as two independent background/foreground processes. (Not
        `combined_server.py`/aiohttp sub-apps as originally planned - see finding 3's revision.)
  - [x] `docker/proxy/Dockerfile` + `docker/proxy/vendor/cors_proxy/` — vendored copy of
        `cors-proxy-py`'s `cors_proxy` package (commit `c0c725b8...`, see `VENDORED.md`), `pip
        install`s `aiohttp`, `Brotli`, and `zstandard` (see the two real-browser encoding bugs
        found in phase (e) below - neither was anticipated in the original spec).
- [x] **(c) Wire nginx routing** — `docker/web/nginx.conf` replaces the image's default
      `/etc/nginx/conf.d/default.conf`: existing static-site `location /` block, plus
      `location /_corsproxy/ { proxy_pass http://proxy:9998/; }` and
      `location /_gitproxy/ { proxy_pass http://proxy:9999/; }` (trailing slash on both sides is
      load-bearing - that's what makes nginx strip the prefix). Also needed, found necessary by a
      real failing request, not copied speculatively from the reference configs:
      `merge_slashes off;` - without it nginx collapses the literal `://` in the embedded target
      URL after `/_corsproxy/`, corrupting it before the proxy ever sees it. `client_max_body_size
      1000M;` also set here, matching the Python side.
- [x] **(d) Client self-host-awareness** — `proxyConfig` in `elab2arc-core...js` now branches on
      `window.location.origin` (production origins `nfdi4plants.org`/`nfdi4plants.github.io` keep
      the exact hardcoded `wb-e.com` values; anything else gets same-origin `/_corsproxy/`/
      `/_gitproxy` paths). `getCorsProxy` exposed on `window` so `git-lfs-service.js` (which loads
      first) can read it lazily via a new `getLfsProxy()` function instead of its own hardcoded
      constant; the two in-file `lfsProxy` literals in `elab2arc-core...js` now call `getCorsProxy()`
      too. `getGitProxy()`'s existing `localStorage` override untouched.
- [x] **(e) Full real end-to-end verification** — done via `docker compose up` + Playwright against
      `http://localhost:8080`, using the same `review_test`-scoped Maintainer-role token from the
      earlier reviewer-token verification pass this session:
  - Confirmed `window.getCorsProxy()` resolves to `http://localhost:8080/_corsproxy/` in-browser.
  - **Two real bugs found and fixed, neither anticipated in the original spec** (both only show up
    with a *real* browser - curl doesn't reproduce either):
    1. The aiohttp sub-app mounting design (finding 3's original plan) broke the git-proxy role -
       see finding 3's revision for the exact mechanism and fix (nginx-side prefix stripping
       instead).
    2. Real Chrome's default `Accept-Encoding` includes `br` (Brotli) and `zstd`; aiohttp's
       `auto_decompress` needs the `Brotli` and `zstandard` packages installed to handle those, or
       it raises and the proxy 502s. Curl doesn't send these by default, so isolated curl testing
       missed it entirely - only caught by the real end-to-end browser conversion attempt.
       Confirmed via the exact exception text surfacing through the 502 response body. Also:
       stopped forwarding upstream's `Content-Length` header, since with `auto_decompress=True`
       the streamed-out body size no longer matches the upstream's original (compressed) one -
       aiohttp falls back to chunked transfer encoding correctly once that header is omitted.
  - **Real conversion succeeded end-to-end**: clicked the real "confirm conversion" flow for
    eLabFTW experiment #40 into `review_test/assays`, got the app's own "✓ All conversions
    complete!" status, and independently confirmed via the GitLab API that real commits
    (`feat: Convert eLabFTW experiment #40 to ARC assay` + the investigation-update commit)
    landed on `review_test`'s `main`, including a real LFS batch-API call and a real LFS object
    `PUT` upload through `/_corsproxy/`.
  - **Full network log inspected - zero requests to `wb-e.com`, `proxy2.wb-e.com`,
    `gitproxy.wb-e.com`, or `gitproxy2.wb-e.com`** anywhere in the entire conversion (confirmed via
    an explicit `wb-e` filter over the complete request list, not just a visual scan). The direct
    eLabFTW attempts that fail with CORS before falling back to `/_corsproxy/` are the same
    expected behavior as production, just routed to the bundled proxy instead of `wb-e.com` on
    fallback.
  - **Cleanup after verification**: reverted the two pushed commits via GitLab's revert-commit API
    (newest first) - `review_test`'s `main` disallows force-push, so this is the only clean option,
    same as the earlier reviewer-token verification pass. Confirmed the revert restored the exact
    pre-test state via a `repository/compare` API call between the pre-test commit and the final
    HEAD after both reverts: **zero diffs**. (First hash comparison attempt used a stale, much
    older baseline commit and appeared to show a mismatch - re-derived the correct immediately-prior
    commit from the real timeline and re-verified; `review_test` is shared infra with real
    independent activity between sessions, not an exclusively-owned scratch repo, so always diff
    against the actual immediately-prior commit, not a remembered one from an earlier session.)
  - **Production-unchanged claim**: verified by code-path inspection (the origin check is a plain
    string-equality branch executed once at load time; the two branches are mutually exclusive and
    the production one is byte-for-byte the pre-existing hardcoded config), not a live
    production-origin test - genuinely can't fake `nfdi4plants.org`'s real TLS/DNS locally. This
    residual gap stands; flagged rather than silently claimed as fully verified.
- [x] **(f) Docs** — `docker/README.md` written: exact self-host instructions, the
      `GENERIC_PROXY_ALLOW_ORIGIN=*` security-default tradeoff from finding 5, known limitations.

## Known gaps (kept up to date post-implementation)

- No true single-image (`docker run`, no compose) path — compose chosen instead, see finding 3.
- `cors-proxy-py` is vendored (copied at build time from commit `c0c725b8...`), not pulled as a
  live dependency - a future upstream change to that project won't automatically propagate here.
- Production-unchanged claim is verified by code-path inspection, not a live production-origin
  test (can't fake `nfdi4plants.org`'s real origin locally) - see phase (e)'s last bullet.
- The generic proxy's `ALLOW_ORIGIN`/CORS headers are permissive by default (`*`) - correct
  tradeoff for single-tenant self-hosted infra per finding 5, but worth knowing if someone reuses
  this proxy in a different, multi-tenant context.
