"""
The listener has to answer on BOTH loopback families.

This is not a style preference. `localhost` resolves to `::1` before
`127.0.0.1`, so an IPv4-only bind makes every `localhost` client wait for a
failed IPv6 connect first — measured at ~2 seconds per request on Windows with
any client that does not implement Happy Eyeballs (Node's fetch, Python's
urllib, most REST tools). The handlers take 4-40ms, so that wait was ~98% of
the response time and looked exactly like a slow API.
"""
import socket
import threading
import time
import urllib.error
import urllib.request

import pytest

from backend.serve import dual_stack_socket


def _free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


@pytest.fixture
def listener():
    """A bare HTTP responder on the real dual-stack socket the app would use."""
    port = _free_port()
    sock = dual_stack_socket(port)
    stop = threading.Event()

    def serve():
        while not stop.is_set():
            try:
                conn, _ = sock.accept()
            except OSError:
                return
            try:
                conn.recv(4096)
                conn.sendall(b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\n"
                             b"Connection: close\r\n\r\nok")
            except OSError:
                pass
            finally:
                conn.close()

    thread = threading.Thread(target=serve, daemon=True)
    thread.start()
    yield port, sock
    stop.set()
    sock.close()
    thread.join(timeout=2)


def _fetch(host: str, port: int, timeout: float = 8.0):
    """urllib deliberately: it does NOT do Happy Eyeballs, so it is the client
    that exposes the stall. curl and Chrome would paper over it."""
    started = time.monotonic()
    body = urllib.request.urlopen(f"http://{host}:{port}/", timeout=timeout).read()
    return body, time.monotonic() - started


def test_ipv4_literal_is_served(listener):
    port, _ = listener
    body, _ = _fetch("127.0.0.1", port)
    assert body == b"ok"


def test_ipv6_loopback_is_served(listener):
    """The half that a plain `uvicorn --host 127.0.0.1` leaves unserved."""
    port, sock = listener
    if sock.family != socket.AF_INET6:
        pytest.skip("host has no IPv6; the launcher fell back to IPv4")
    body, _ = _fetch("[::1]", port)
    assert body == b"ok"


def test_localhost_does_not_pay_a_fallback_penalty(listener):
    """The regression that matters: `localhost` tries ::1 first, and if that is
    refused the client eats the connect timeout on every single request."""
    port, sock = listener
    if sock.family != socket.AF_INET6:
        pytest.skip("host has no IPv6; the launcher fell back to IPv4")
    body, elapsed = _fetch("localhost", port)
    assert body == b"ok"
    # A served socket answers in milliseconds. The broken path measured ~2s.
    assert elapsed < 1.0, (
        f"localhost took {elapsed:.2f}s — the IPv6 half of loopback is not "
        f"being served, so clients are falling back after a failed connect")


def test_falls_back_rather_than_refusing_to_start(monkeypatch):
    """A host with IPv6 compiled out must still get a working server."""
    real_socket = socket.socket

    def no_ipv6(family=socket.AF_INET, *args, **kwargs):
        if family == socket.AF_INET6:
            raise OSError("IPv6 disabled on this host")
        return real_socket(family, *args, **kwargs)

    monkeypatch.setattr(socket, "socket", no_ipv6)
    sock = dual_stack_socket(_free_port())
    try:
        assert sock.family == socket.AF_INET
    finally:
        sock.close()
