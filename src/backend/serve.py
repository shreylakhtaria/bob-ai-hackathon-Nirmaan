"""
Launcher that serves IPv4 and IPv6 on one socket.

Why this exists rather than `uvicorn backend.main:app --host ...`:

`--host` takes one address, and one address means one address family.
`--host 127.0.0.1` (uvicorn's default) and `--host 0.0.0.0` serve IPv4 only;
`--host ::` serves IPv6 only, because asyncio sets IPV6_V6ONLY on the socket it
creates. Either way, half the loopback is unserved.

That matters because `localhost` resolves to `::1` *before* `127.0.0.1` on
Windows and most modern Linux. A client that asks for `http://localhost:8000`
therefore tries IPv6 first and hits a closed port. Clients that implement Happy
Eyeballs (curl, Chrome) fall back to IPv4 after a couple of hundred
milliseconds; clients that do not — Node's fetch/undici, Python's urllib,
requests, most REST clients — wait for the TCP connect to time out first. On
this machine that wait measures **~2 seconds, on every single request**, which
looks exactly like "the API is slow" while the handler itself takes 4-40ms.

Measured on Windows 11, `/api/crews`:

    bind            127.0.0.1    localhost    [::1]
    127.0.0.1       0.004s       0.236s       2.05s (fail)
    ::              2.04s (fail) 0.011s       0.003s
    dual-stack      0.004s       0.006s       0.004s

So the fix is to bind an AF_INET6 socket with IPV6_V6ONLY cleared, which
accepts IPv4 connections as v4-mapped addresses, and hand that socket to
uvicorn. One listener, both families, no fallback wait.

Usage:  python -m backend.serve [--port 8000] [--reload]

`--reload` is delegated back to uvicorn's own runner, because the reloader
re-executes this module in a child process and cannot inherit our socket. In
reload mode the dual-stack bind is therefore not available; that is a
development-only path and `127.0.0.1` still works there.
"""
import argparse
import os
import socket
import sys


def dual_stack_socket(port: int, backlog: int = 128) -> socket.socket:
    """An AF_INET6 listener that also accepts IPv4, or an IPv4 one if it can't.

    Falls back rather than refusing to start: a host with IPv6 disabled
    entirely should still be able to run the API.
    """
    try:
        sock = socket.socket(socket.AF_INET6, socket.SOCK_STREAM)
        # The whole point: without this, the kernel serves IPv6 only.
        sock.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 0)
        # Not SO_REUSEPORT: on Windows that silently allows two servers to bind
        # the same port and split connections between them, which is a much
        # worse failure than "port in use".
        if os.name != "nt":
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        sock.bind(("::", port))
    except OSError as exc:
        if getattr(exc, "errno", None) in (98, 10048):   # EADDRINUSE
            raise
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        if os.name != "nt":
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        sock.bind(("0.0.0.0", port))
        print(f"note: IPv6 unavailable ({exc}); serving IPv4 only", file=sys.stderr)

    sock.listen(backlog)
    sock.set_inheritable(True)
    return sock


def main() -> int:
    parser = argparse.ArgumentParser(description="Run the Grid Risk API.")
    parser.add_argument("--port", type=int, default=int(os.getenv("PORT", "8000")))
    parser.add_argument("--reload", action="store_true",
                        help="Development autoreload. Binds IPv4 only (see module docstring).")
    args = parser.parse_args()

    import uvicorn

    if args.reload:
        # The reloader spawns a child process that re-imports this module, so it
        # cannot be handed a socket we already bound.
        uvicorn.run("backend.main:app", host="127.0.0.1", port=args.port, reload=True)
        return 0

    sock = dual_stack_socket(args.port)
    family = "IPv4 + IPv6" if sock.family == socket.AF_INET6 else "IPv4"
    print(f"==> API on port {args.port} ({family}) — http://localhost:{args.port} "
          f"and http://127.0.0.1:{args.port} are both served")

    config = uvicorn.Config("backend.main:app", log_level="info")
    uvicorn.Server(config).run(sockets=[sock])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
