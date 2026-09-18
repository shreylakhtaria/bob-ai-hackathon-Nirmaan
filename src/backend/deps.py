"""
Authorization dependencies.

The security boundary is here, on the server. The frontend hiding a button is a
UX affordance, not a control — every protected operation routes through one of
these and derives the role from the signed access token.
"""
from fastapi import Depends, HTTPException

from . import config
from .services import auth as auth_svc

CurrentUser = Depends(auth_svc.get_current_user)


def require_authenticated_user(user: dict = CurrentUser) -> dict:
    """Any signed-in operator, whatever their role."""
    return user


def require_role(*roles: str):
    """Allow only the named roles. Usage: `Depends(require_role("admin"))`."""
    unknown = set(roles) - set(config.ROLES)
    if unknown:  # wiring mistake — fail at import, not at request time
        raise ValueError(f"Unknown role(s) in require_role: {sorted(unknown)}")

    def _guard(user: dict = CurrentUser) -> dict:
        if user["role"] not in roles:
            raise HTTPException(
                403, f"This action requires one of: {', '.join(sorted(roles))}")
        return user

    return _guard


# Named aliases for the common cases, so route signatures stay readable and the
# policy lives in one place rather than being spelled out at each call site.
require_admin = require_role("admin")
require_operator = require_role("admin", "operator")          # operational control
require_any_role = require_role("admin", "operator", "crew")  # any signed-in user
