"""
Global error handling.

Every failure leaves the API in one shape:

    {"success": false,
     "error": {"code": "...", "message": "...", "details": {...}}}

so the frontend has a single branch to write instead of guessing per endpoint.
Detail is logged server-side; in production the response body stays generic for
unexpected errors, because stack traces and SQL text are a disclosure risk.
"""
import logging

from fastapi import HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from . import config

log = logging.getLogger("grid.api")

# HTTP status -> stable, machine-readable code the frontend can switch on.
_CODES = {
    400: "BAD_REQUEST",
    401: "UNAUTHENTICATED",
    403: "FORBIDDEN",
    404: "NOT_FOUND",
    409: "CONFLICT",
    413: "PAYLOAD_TOO_LARGE",
    422: "VALIDATION_ERROR",
    429: "RATE_LIMITED",
    500: "INTERNAL_ERROR",
    503: "SERVICE_UNAVAILABLE",
}


def error_response(status: int, message: str, code: str = None, details=None) -> JSONResponse:
    return JSONResponse(
        status_code=status,
        content={"success": False,
                 "error": {"code": code or _CODES.get(status, "ERROR"),
                           "message": message,
                           "details": details or {}}},
    )


def register(app) -> None:
    @app.exception_handler(StarletteHTTPException)
    async def _http_error(request: Request, exc: StarletteHTTPException):
        # HTTPException(...) raised deliberately by our own code: the message is
        # written for a user, so it is safe to pass through verbatim.
        if exc.status_code >= 500:
            log.error("server error on %s: %s", request.url.path, exc.detail)
        return error_response(exc.status_code, str(exc.detail))

    @app.exception_handler(RequestValidationError)
    async def _validation_error(request: Request, exc: RequestValidationError):
        # Field-level detail so the client can mark the offending input, with
        # the input value dropped — it may contain a password.
        fields = [{"field": ".".join(str(p) for p in e["loc"] if p != "body"),
                   "message": e["msg"], "type": e["type"]}
                  for e in exc.errors()]
        return error_response(422, "Request validation failed",
                              details={"fields": fields})

    @app.exception_handler(Exception)
    async def _unhandled(request: Request, exc: Exception):
        # Anything reaching here is a bug. Log it with the traceback, and tell
        # the client nothing about our internals.
        log.exception("unhandled error on %s %s", request.method, request.url.path)
        message = (str(exc) if not config.IS_PRODUCTION
                   else "An unexpected error occurred. The incident has been logged.")
        return error_response(500, message)
