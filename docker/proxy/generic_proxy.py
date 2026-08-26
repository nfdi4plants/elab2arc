"""
Generic CORS+LFS API proxy for self-hosted elab2arc.

Bundles what the maintainer's production `proxy.wb-e.com` actually does for
elab2arc's client code (see js/elab2arc-core20260504.js's fetchWithProxyFallback()
and js/modules/git-lfs-service.js's LFS upload path): the client embeds the full,
already-schemed target URL directly after this service's own mount path
(e.g. request path "/https://elab.dataplan.top/api/v2/users"), and expects the
proxy to forward it verbatim - any method, any path shape, not just git protocol
operations.

This is deliberately NOT cors-proxy-py (the vendored git-proxy dependency next to
this file): that project gates every request through allow_request.allow(), which
only recognizes literal git-protocol shapes (info/refs, upload-pack, receive-pack)
and 403s everything else, and its parse_path() expects a bare-domain path with no
scheme (isomorphic-git's own convention) rather than elab2arc's full-URL-embedded
one. Neither constraint fits the generic REST/LFS traffic this module handles.
"""

import os
from typing import Optional

from aiohttp import web
from aiohttp.client import ClientSession

# Real nginx configs at proxy.wb-e.com/proxy2.wb-e.com set client_max_body_size 1000M
# for LFS uploads - match that here (aiohttp defaults to 100MB).
MAX_BODY_SIZE = 1000 * 1024 * 1024

FORWARD_REQUEST_HEADERS = [
    "authorization",
    "content-type",
    "accept",
    "accept-language",
    "accept-encoding",
    "x-requested-with",
    "cache-control",
    "range",
]

EXPOSE_RESPONSE_HEADERS = [
    # Deliberately no "content-length": with auto_decompress=True the body we
    # stream out is the decompressed size, not the upstream's original
    # (compressed) Content-Length - forwarding that header verbatim would give
    # the client a byte count that doesn't match the actual body, truncating
    # or hanging the response. aiohttp's StreamResponse falls back to chunked
    # transfer encoding when Content-Length isn't set, which is correct here.
    "content-range",
    "content-type",
    "etag",
    "location",
    "last-modified",
    "cache-control",
]

ALLOWED_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]


def get_allow_origin() -> str:
    """Default permissive - this is single-tenant self-hosted infra, not shared
    production infra, so zero-config "just works" wins over an allowlist. See
    docker/README.md for the explicit tradeoff writeup."""
    return os.environ.get("GENERIC_PROXY_ALLOW_ORIGIN", "*")


def _cors_headers(origin: str) -> dict:
    return {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": ", ".join(ALLOWED_METHODS),
        "Access-Control-Allow-Headers": "Authorization, Content-Type, Accept, X-Requested-With, Range, Cache-Control",
        "Access-Control-Expose-Headers": ", ".join(EXPOSE_RESPONSE_HEADERS),
        "Access-Control-Allow-Credentials": "false",
        "Access-Control-Max-Age": "86400",
    }


def create_app() -> web.Application:
    app = web.Application(client_max_size=MAX_BODY_SIZE)
    session_holder: dict[str, Optional[ClientSession]] = {"session": None}

    async def get_session() -> ClientSession:
        if session_holder["session"] is None:
            # auto_decompress=True (the default): the upstream response body is
            # decompressed by aiohttp before we stream it back out, so the client
            # gets plain bytes with no Content-Encoding header - simpler than
            # forwarding compression headers through a second hop. Confirmed
            # necessary with auto_decompress=False against the real eLabFTW API:
            # it gzips responses, and we weren't forwarding content-encoding, so
            # the client received undecodable raw gzip bytes.
            session_holder["session"] = ClientSession(auto_decompress=True)
        return session_holder["session"]

    async def cleanup(_app: web.Application) -> None:
        session = session_holder["session"]
        if session is not None:
            await session.close()

    app.on_cleanup.append(cleanup)

    async def handler(request: web.Request) -> web.StreamResponse:
        origin = get_allow_origin()

        if request.method == "OPTIONS":
            return web.Response(status=204, headers=_cors_headers(origin))

        # This app runs standalone on its own port (see entrypoint.sh) with no
        # mount prefix of its own - nginx strips the "/_corsproxy" prefix
        # before forwarding (see docker/web/nginx.conf), so request.match_info
        # ['tail'] is already just the literal target URL, scheme included,
        # exactly as the client constructed it.
        target = request.match_info.get("tail", "")
        if request.query_string:
            target = f"{target}?{request.query_string}"

        if not (target.startswith("http://") or target.startswith("https://")):
            return web.Response(
                status=400,
                text="Bad Request: expected a full target URL (with scheme) after the proxy path",
                headers=_cors_headers(origin),
            )

        forward_headers = {}
        headers_lower = {k.lower(): v for k, v in request.headers.items()}
        for h in FORWARD_REQUEST_HEADERS:
            if h in headers_lower:
                forward_headers[h] = headers_lower[h]

        body = None
        if request.method not in ("GET", "HEAD"):
            body = request.content  # stream, don't buffer - LFS uploads can be large

        session = await get_session()
        try:
            async with session.request(
                request.method,
                target,
                headers=forward_headers,
                data=body,
                allow_redirects=False,
            ) as upstream:
                response = web.StreamResponse(status=upstream.status, reason=upstream.reason)
                for h in EXPOSE_RESPONSE_HEADERS:
                    if h in upstream.headers:
                        response.headers[h] = upstream.headers[h].replace("\r", "").replace("\n", "")
                response.headers.update(_cors_headers(origin))

                await response.prepare(request)
                async for chunk in upstream.content.iter_chunked(65536):
                    await response.write(chunk)
                return response
        except Exception as e:
            import traceback
            print(f"[generic_proxy] ERROR proxying {request.method} {target}: {e!r}")
            traceback.print_exc()
            return web.Response(status=502, text=f"Bad Gateway: {e}", headers=_cors_headers(origin))

    app.router.add_route("*", "/{tail:.*}", handler)
    return app


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "9998"))
    web.run_app(create_app(), host="0.0.0.0", port=port)
