"""
CORS Proxy Server - Main aiohttp application.

Port of index.js from @isomorphic-git/cors-proxy.
"""

import os
from typing import Callable, Optional

from aiohttp import web

from . import __version__
from .config import get_allow_origin, get_insecure_http_origins, get_port
from .middleware import create_proxy_middleware


def create_info_html() -> str:
    """Create the HTML info page for the root path."""
    allow_origin = os.environ.get("ALLOW_ORIGIN", "*")
    return f"""<!DOCTYPE html>
<html>
  <title>cors-proxy (Python)</title>
  <h1>cors-proxy (Python)</h1>
  <p>This is the Python port of the server software that runs on
     <a href="https://cors.isomorphic-git.org">https://cors.isomorphic-git.org</a>
     &ndash; a free service for users of <a href="https://isomorphic-git.org">isomorphic-git</a>
     that enables cloning and pushing repos in the browser.</p>
  <p>The original source code is hosted on Github at
     <a href="https://github.com/isomorphic-git/cors-proxy">https://github.com/isomorphic-git/cors-proxy</a></p>
  <p>Python port version: {__version__}</p>

  <h2>Terms of Use</h2>
  <p><b>This free service is provided to you AS IS with no guarantees.
  By using this free service, you promise not to use excessive amounts of bandwidth.
  </b></p>

  <p><b>If you are cloning or pushing large amounts of data your IP address may be banned.
  Please run your own instance of the software if you need to make heavy use this service.</b></p>

  <h2>Allowed Origins</h2>
  This proxy allows git clone / fetch / push / getRemoteInfo requests from these domains: <code>{allow_origin}</code>
</html>
"""


def create_app(
    origin: Optional[str] = None,
    insecure_origins: list[str] = None,
    authorization: Optional[Callable] = None,
) -> web.Application:
    """
    Create the aiohttp application with CORS proxy middleware.

    Args:
        origin: The value for Access-Control-Allow-Origin header
        insecure_origins: List of domains to use HTTP instead of HTTPS
        authorization: Optional async function to check authorization
    """
    # Use environment defaults if not provided
    if origin is None:
        origin = get_allow_origin()
    if insecure_origins is None:
        insecure_origins = get_insecure_http_origins()

    # Create middleware
    proxy_middleware, get_client_session = create_proxy_middleware(
        origin=origin,
        insecure_origins=insecure_origins,
        authorization=authorization,
    )

    # Create app
    app = web.Application(middlewares=[proxy_middleware])

    # Root handler - info page
    async def root_handler(request: web.Request) -> web.Response:
        if request.path == "/":
            html = create_info_html()
            return web.Response(status=299, text=html, content_type="text/html")
        # Not a git request and not root - 403
        return web.Response(status=403, text="")

    app.router.add_route("*", "/{path:.*}", root_handler)

    # Cleanup client session on shutdown
    async def cleanup_session(app: web.Application):
        session = await get_client_session()
        if session:
            await session.close()

    app.on_cleanup.append(cleanup_session)

    return app


def run_server(port: int = None):
    """
    Run the server.

    Args:
        port: Port to listen on (default from environment or 9999)
    """
    if port is None:
        port = get_port()

    app = create_app()
    web.run_app(app, host="0.0.0.0", port=port, print=lambda x: print(f"Server running on http://0.0.0.0:{port}"))


if __name__ == "__main__":
    run_server()