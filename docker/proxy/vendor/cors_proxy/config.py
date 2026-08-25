"""
Configuration helpers for cors-proxy.

Environment variables:
- PORT: the port to listen to (default: 9999)
- ALLOW_ORIGIN: the value for the 'Access-Control-Allow-Origin' CORS header
- INSECURE_HTTP_ORIGINS: comma separated list of origins for which HTTP should be used instead of HTTPS
"""

import os
from typing import Optional


def get_port() -> int:
    """Get the port from environment variable."""
    raw = os.environ.get("PORT", "9999")
    try:
        port = int(raw)
    except ValueError:
        raise SystemExit(f"Invalid PORT value: {raw!r} — must be an integer")
    if not (1 <= port <= 65535):
        raise SystemExit(f"Invalid PORT value: {port} — must be between 1 and 65535")
    return port


def get_max_response_size() -> int:
    """Get the maximum allowed response body size in bytes (default 512 MB)."""
    raw = os.environ.get("MAX_RESPONSE_SIZE", str(512 * 1024 * 1024))
    try:
        return int(raw)
    except ValueError:
        raise SystemExit(f"Invalid MAX_RESPONSE_SIZE value: {raw!r} — must be an integer")


def get_allow_origin() -> Optional[str]:
    """Get the allowed origin from environment variable."""
    return os.environ.get("ALLOW_ORIGIN")


def get_insecure_http_origins() -> list[str]:
    """Get the list of insecure HTTP origins from environment variable."""
    origins = os.environ.get("INSECURE_HTTP_ORIGINS", "")
    if not origins:
        return []
    return [o.strip() for o in origins.split(",") if o.strip()]