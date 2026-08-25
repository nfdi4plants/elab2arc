"""
CLI for cors-proxy.

Port of bin.js from @isomorphic-git/cors-proxy.

Commands:
- cors-proxy start [-p PORT] [-d]
- cors-proxy stop
"""

import argparse
import os
import signal
import sys
from pathlib import Path

import psutil

PID_FILE = "cors-proxy.pid"


def get_pid_file_path() -> Path:
    """Get the PID file path in current working directory."""
    return Path.cwd() / PID_FILE


def start_server(port: int, daemon: bool = False):
    """
    Start the cors-proxy server.

    Args:
        port: Port to listen on
        daemon: Whether to run as daemon
    """
    if daemon:
        # Daemonize using fork
        # First fork
        pid = os.fork()
        if pid > 0:
            # Parent exits
            print(f"Started daemon on port {port}")
            sys.exit(0)

        # Decouple from parent environment
        os.chdir("/")
        os.setsid()
        os.umask(0)

        # Second fork
        pid = os.fork()
        if pid > 0:
            sys.exit(0)

        # Redirect standard file descriptors
        sys.stdout.flush()
        sys.stderr.flush()
        stdin = open("/dev/null", "r")
        stdout = open("/dev/null", "a+")
        stderr = open("/dev/null", "a+")
        os.dup2(stdin.fileno(), sys.stdin.fileno())
        os.dup2(stdout.fileno(), sys.stdout.fileno())
        os.dup2(stderr.fileno(), sys.stderr.fileno())

        # Write PID file (use process group leader PID)
        pid_file = get_pid_file_path()
        pid_file.write_text(str(os.getpid()))

    # Import and run server
    from .server import run_server

    os.environ["PORT"] = str(port)
    run_server(port)


def stop_server():
    """Stop the cors-proxy server by killing the process tree."""
    pid_file = get_pid_file_path()

    if not pid_file.exists():
        print("No cors-proxy.pid file")
        return

    try:
        pid = int(pid_file.read_text().strip())
    except ValueError:
        print("Invalid PID in cors-proxy.pid file")
        pid_file.unlink()
        return

    print(f"Killing process tree with PID {pid}")

    try:
        process = psutil.Process(pid)
        # Kill entire process tree
        children = process.children(recursive=True)
        for child in children:
            try:
                child.kill()
            except psutil.NoSuchProcess:
                pass
        process.kill()

        # Wait for processes to terminate
        gone, alive = psutil.wait_procs(children + [process], timeout=5)

        # Remove PID file
        pid_file.unlink()
        print("Server stopped")

    except psutil.NoSuchProcess:
        print(f"Process {pid} not found")
        pid_file.unlink()
    except Exception as e:
        print(f"Error stopping server: {e}")


def main():
    """Main CLI entry point."""
    parser = argparse.ArgumentParser(
        prog="cors-proxy",
        description="CORS Proxy for Git - Python port of @isomorphic-git/cors-proxy",
    )

    subparsers = parser.add_subparsers(dest="command", help="Commands")

    # start command
    start_parser = subparsers.add_parser("start", help="Start the proxy server")
    start_parser.add_argument(
        "-p",
        "--port",
        type=int,
        default=9999,
        help="Port to listen on (default: 9999)",
    )
    start_parser.add_argument(
        "-d",
        "--daemon",
        action="store_true",
        help="Run as daemon (writes PID to cors-proxy.pid)",
    )

    # stop command
    stop_parser = subparsers.add_parser("stop", help="Stop the daemon server")

    args = parser.parse_args()

    if args.command == "start":
        start_server(args.port, args.daemon)
    elif args.command == "stop":
        stop_server()
    else:
        parser.print_help()
        sys.exit(1)


if __name__ == "__main__":
    main()