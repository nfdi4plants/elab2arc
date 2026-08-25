"""
Predicate functions to detect git protocol requests.

Port of allow-request.js from @isomorphic-git/cors-proxy.
"""

from typing import Mapping


def is_preflight_info_refs(method: str, pathname: str, query: Mapping[str, str]) -> bool:
    """Check if this is an OPTIONS preflight request for info/refs."""
    service = query.get("service", "")
    return (
        method == "OPTIONS"
        and pathname.endswith("/info/refs")
        and service in ("git-upload-pack", "git-receive-pack")
    )


def is_info_refs(method: str, pathname: str, query: Mapping[str, str]) -> bool:
    """Check if this is a GET request for info/refs."""
    service = query.get("service", "")
    return (
        method == "GET"
        and pathname.endswith("/info/refs")
        and service in ("git-upload-pack", "git-receive-pack")
    )


def is_preflight_pull(method: str, headers: Mapping[str, str], pathname: str) -> bool:
    """Check if this is an OPTIONS preflight request for git-upload-pack."""
    request_headers = headers.get("access-control-request-headers", "")
    return (
        method == "OPTIONS"
        and "content-type" in request_headers.lower()
        and pathname.endswith("git-upload-pack")
    )


def is_pull(method: str, headers: Mapping[str, str], pathname: str) -> bool:
    """Check if this is a POST request for git-upload-pack."""
    content_type = headers.get("content-type", "")
    return (
        method == "POST"
        and content_type == "application/x-git-upload-pack-request"
        and pathname.endswith("git-upload-pack")
    )


def is_preflight_push(method: str, headers: Mapping[str, str], pathname: str) -> bool:
    """Check if this is an OPTIONS preflight request for git-receive-pack."""
    request_headers = headers.get("access-control-request-headers", "")
    return (
        method == "OPTIONS"
        and "content-type" in request_headers.lower()
        and pathname.endswith("git-receive-pack")
    )


def is_push(method: str, headers: Mapping[str, str], pathname: str) -> bool:
    """Check if this is a POST request for git-receive-pack."""
    content_type = headers.get("content-type", "")
    return (
        method == "POST"
        and content_type == "application/x-git-receive-pack-request"
        and pathname.endswith("git-receive-pack")
    )


def allow(method: str, headers: Mapping[str, str], pathname: str, query: Mapping[str, str]) -> bool:
    """Check if the request is a valid git protocol request."""
    return (
        is_preflight_info_refs(method, pathname, query)
        or is_info_refs(method, pathname, query)
        or is_preflight_pull(method, headers, pathname)
        or is_pull(method, headers, pathname)
        or is_preflight_push(method, headers, pathname)
        or is_push(method, headers, pathname)
    )