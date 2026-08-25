# Vendored dependency: cors-proxy-py

`vendor/cors_proxy/` is a byte-for-byte copy of the `cors_proxy` package from
[cors-proxy-py](https://github.com/nfdi4plants/... local path: `/Users/xr/git/elab2arc/cors-proxy-py`
on the maintainer's machine - not a git submodule), used unmodified for the
git-proxy role (`combined_server.py` mounts it at `/_gitproxy`).

Vendored from commit `c0c725b883123cb4c372363b45de8b80d399e5e8` ("init",
2026-04-09). If that project changes upstream, re-copy its `cors_proxy/`
directory here and note the new commit hash.

Not modified in any way - see `docker/TODOs.md` finding 2 for why the *new*
`generic_proxy.py` module exists alongside it instead of extending it in place.
