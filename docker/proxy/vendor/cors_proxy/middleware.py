"""
CORS Proxy Middleware - Core proxy logic.

Port of middleware.js from @isomorphic-git/cors-proxy.
"""

import re
import time
from datetime import datetime
from typing import Awaitable, Callable, Mapping, Optional
from urllib.parse import urlencode

from aiohttp import web
from aiohttp.client import ClientSession

from .allow_request import allow
from .config import get_max_response_size

# Headers to forward from client to target
ALLOW_HEADERS = [
    "accept-encoding",
    "accept-language",
    "accept",
    "access-control-allow-origin",
    "authorization",
    "cache-control",
    "connection",
    "content-length",
    "content-type",
    "dnt",
    "git-protocol",
    "pragma",
    "range",
    "referer",
    "user-agent",
    "x-authorization",
    "x-http-method-override",
    "x-requested-with",
]

# Headers to expose to client
EXPOSE_HEADERS = [
    "accept-ranges",
    "age",
    "cache-control",
    "content-length",
    "content-language",
    "content-type",
    "date",
    "etag",
    "expires",
    "last-modified",
    "location",
    "pragma",
    "server",
    "transfer-encoding",
    "vary",
    "x-github-request-id",
    "x-redirected-url",
]

# Allowed methods
ALLOW_METHODS = ["POST", "GET", "OPTIONS"]


def timestamp() -> str:
    """Format current time as ISO timestamp."""
    return datetime.now().isoformat()


def is_git_push(pathname: str, method: str, content_type: str, query: dict) -> bool:
    """Check if this is a git push operation."""
    service = query.get("service", "")
    return (
        (method == "POST" and content_type == "application/x-git-receive-pack-request")
        or (method == "GET" and "/info/refs" in pathname and service == "git-receive-pack")
        or (method == "OPTIONS" and "git-receive-pack" in pathname)
    )


def parse_path(path: str) -> tuple[str, str]:
    """
    Parse proxy path into domain and remaining path.

    Path format: /{domain}/{remaining_path}
    Returns: (domain, remaining_path)
    """
    match = re.match(r"/([^/]+)/(.*)", path)
    if not match:
        raise ValueError(f"Invalid path format: {path}")
    return match.group(1), match.group(2)


def make_cors_middleware(
    origin: Optional[str] = None,
) -> Callable[[web.Request, web.Response], Awaitable[web.Response]]:
    """Create CORS headers middleware."""

    @web.middleware
    async def cors_middleware(request: web.Request, handler: Callable[[web.Request], Awaitable[web.Response]]) -> web.Response:
        # Handle OPTIONS preflight
        if request.method == "OPTIONS":
            response = web.Response(status=200)
        else:
            response = await handler(request)

        # Set CORS headers
        response.headers["Access-Control-Allow-Origin"] = origin or "*"
        response.headers["Access-Control-Allow-Methods"] = ", ".join(ALLOW_METHODS)
        response.headers["Access-Control-Allow-Headers"] = ", ".join(ALLOW_HEADERS)
        response.headers["Access-Control-Expose-Headers"] = ", ".join(EXPOSE_HEADERS)
        response.headers["Access-Control-Allow-Credentials"] = "false"

        return response

    return cors_middleware


async def proxy_handler(
    request: web.Request,
    client_session: ClientSession,
    insecure_origins: list[str],
    origin: Optional[str] = None,
    authorization: Optional[Callable[[web.Request], Awaitable[bool]]] = None,
) -> web.StreamResponse:
    """
    Proxy the request to the target git server.
    """
    pathname = request.path
    query = dict(request.query)
    headers = dict(request.headers)
    method = request.method
    start_time = time.time()

    # Check if git push
    content_type = headers.get("content-type", "")
    is_push = is_git_push(pathname, method, content_type, query)

    # Log incoming request
    user_agent = headers.get("user-agent", "no-ua")
    print(f"[{timestamp()}] {method} {pathname} - {user_agent}")
    if is_push:
        print(f"[{timestamp()}] >>> GIT PUSH OPERATION DETECTED <<<")

    # Run authorization if provided
    if authorization:
        auth_result = await authorization(request)
        if not auth_result:
            return web.Response(status=401, text="Unauthorized")

    # Build headers to forward (case-insensitive lookup)
    forward_headers = {}
    headers_lower = {k.lower(): v for k, v in headers.items()}
    for h in ALLOW_HEADERS:
        if h in headers_lower:
            forward_headers[h] = headers_lower[h]

    # Set user-agent if not git/
    user_agent_val = forward_headers.get("user-agent", "")
    if not user_agent_val.startswith("git/"):
        forward_headers["user-agent"] = "git/@isomorphic-git/cors-proxy"

    # Parse path and build target URL
    pathdomain, remainingpath = parse_path(request.path)
    protocol = "http" if pathdomain in insecure_origins else "https"
    target_url = f"{protocol}://{pathdomain}/{remainingpath}"

    # Add query parameters (URL-encoded to prevent injection)
    if query:
        target_url = f"{target_url}?{urlencode(query)}"

    print(f"[{timestamp()}] Proxying to: {target_url}")

    # Build request body
    body = None
    if method not in ("GET", "HEAD"):
        body = request.content

    # Make proxy request
    try:
        async with client_session.request(
            method,
            target_url,
            headers=forward_headers,
            data=body,
            allow_redirects=False,  # Manual redirect handling
        ) as proxy_response:
            duration_ms = int((time.time() - start_time) * 1000)

            # Handle redirect - rewrite location header
            if "location" in proxy_response.headers:
                location = proxy_response.headers["location"]
                new_location = re.sub(r"^https?:", "", location)
                # Strip CR/LF to prevent header injection
                proxy_response.headers["location"] = new_location.replace("\r", "").replace("\n", "")

            # Build response
            response = web.StreamResponse(
                status=proxy_response.status,
                reason=proxy_response.reason,
            )

            # Set exposed headers
            for h in EXPOSE_HEADERS:
                if h == "content-length":
                    continue
                if h in proxy_response.headers:
                    # Strip CR/LF from all header values to prevent header injection
                    response.headers[h] = proxy_response.headers[h].replace("\r", "").replace("\n", "")

            # Set x-redirected-url if redirected
            if str(proxy_response.url) != target_url:
                safe_url = str(proxy_response.url).replace("\r", "").replace("\n", "")
                response.headers["x-redirected-url"] = safe_url

            # Set CORS headers before prepare() — once prepare() is called headers are sent
            response.headers["Access-Control-Allow-Origin"] = origin or "*"
            response.headers["Access-Control-Allow-Methods"] = ", ".join(ALLOW_METHODS)
            response.headers["Access-Control-Allow-Headers"] = ", ".join(ALLOW_HEADERS)
            response.headers["Access-Control-Expose-Headers"] = ", ".join(EXPOSE_HEADERS)
            response.headers["Access-Control-Allow-Credentials"] = "false"

            # Log response
            print(f"[{timestamp()}] Response: {proxy_response.status} {proxy_response.reason} ({duration_ms}ms)")
            if is_push:
                print(f"[{timestamp()}] >>> GIT PUSH PROGRESS: Response {proxy_response.status} received ({duration_ms}ms) <<<")

            # Stream response body
            await response.prepare(request)

            bytes_transferred = 0
            chunk_count = 0
            max_size = get_max_response_size()

            async for chunk in proxy_response.content.iter_chunked(8192):
                bytes_transferred += len(chunk)
                if bytes_transferred > max_size:
                    print(f"[{timestamp()}] ERROR: Response exceeded MAX_RESPONSE_SIZE ({max_size} bytes), aborting")
                    break
                await response.write(chunk)
                chunk_count += 1

                # Log push progress every ~100KB
                if is_push and chunk_count % 13 == 0:  # ~100KB (13 * 8192)
                    kb = bytes_transferred / 1024
                    print(f"[{timestamp()}] >>> GIT PUSH PROGRESS: Transferred {int(kb)}KB <<<")

            if is_push:
                total_kb = int(bytes_transferred / 1024)
                total_ms = int((time.time() - start_time) * 1000)
                print(f"[{timestamp()}] >>> GIT PUSH COMPLETE: Total {total_kb}KB transferred ({total_ms}ms) <<<")

            return response

    except Exception as e:
        duration_ms = int((time.time() - start_time) * 1000)
        print(f"[{timestamp()}] ERROR after {duration_ms}ms: {e}")
        if is_push:
            print(f"[{timestamp()}] >>> GIT PUSH FAILED <<<")
        raise


def create_proxy_middleware(
    origin: Optional[str] = None,
    insecure_origins: list[str] = None,
    authorization: Optional[Callable[[web.Request], Awaitable[bool]]] = None,
):
    """
    Create the complete proxy middleware with CORS and filtering.

    Args:
        origin: The value for Access-Control-Allow-Origin header
        insecure_origins: List of domains to use HTTP instead of HTTPS
        authorization: Optional async function to check authorization
    """
    insecure_origins = insecure_origins or []
    cors_middleware = make_cors_middleware(origin)

    # Create shared client session
    client_session = None

    async def get_client_session():
        nonlocal client_session
        if client_session is None:
            client_session = ClientSession()
        return client_session

    @web.middleware
    async def proxy_middleware(request: web.Request, handler: Callable[[web.Request], Awaitable[web.Response]]) -> web.Response:
        # Check if this is a git request
        pathname = request.path
        query = dict(request.query)
        headers_lower = {k.lower(): v for k, v in request.headers.items()}

        # Log ALL incoming requests
        print(f"[{timestamp()}] INCOMING: {request.method} {pathname} query={query}")

        if not allow(request.method, headers_lower, pathname, query):
            # Not a git request, pass to next handler
            print(f"[{timestamp()}] FILTERED OUT (not git request)")
            return await cors_middleware(request, handler)

        # Handle OPTIONS preflight for git requests
        if request.method == "OPTIONS":
            response = web.Response(status=200)
            response.headers["Access-Control-Allow-Origin"] = origin or "*"
            response.headers["Access-Control-Allow-Methods"] = ", ".join(ALLOW_METHODS)
            response.headers["Access-Control-Allow-Headers"] = ", ".join(ALLOW_HEADERS)
            response.headers["Access-Control-Expose-Headers"] = ", ".join(EXPOSE_HEADERS)
            response.headers["Access-Control-Allow-Credentials"] = "false"
            return response

        # Proxy the request
        session = await get_client_session()
        return await proxy_handler(request, session, insecure_origins, origin, authorization)

    return proxy_middleware, get_client_session