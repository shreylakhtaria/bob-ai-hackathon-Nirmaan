"""
CSV bulk ingestion for `crews` and `assets`.

Two modes over one code path: `validate` is a dry run, `commit` writes the valid
rows in a single transaction. Both return the same report shape, so the UI can
show the operator exactly what will happen before it happens.

Design notes:
  * Nothing is silently dropped. Every rejected row appears in `errors` with its
    1-based line number, the offending field and the value we saw.
  * Partial import is deliberate: a handful of bad rows should not cost the
    operator the other 900 good ones. The inserts still share ONE transaction,
    so a mid-batch database failure rolls the whole batch back rather than
    leaving half a file imported.
  * Uploads are untrusted input: size-capped, row-capped, decoded strictly, and
    every stored text cell is neutralised against CSV formula injection (these
    rows come back out through /api/export/* and land in someone's Excel).
"""
import csv
import io
import sqlite3

from .. import config, db

# Cells beginning with one of these are interpreted as a formula by Excel /
# Sheets / LibreOffice on export. Prefixing with an apostrophe keeps the value
# readable while forcing it to be treated as text.
_FORMULA_PREFIXES = ("=", "+", "-", "@", "\t", "\r")


def _neutralise(value):
    """Defuse CSV formula injection in a text cell before it is stored."""
    return "'" + value if value[:1] in _FORMULA_PREFIXES else value


# ---------------------------------------------------------------------------
# Column validators. Each takes the raw string and returns (value, error) —
# error is None when the cell is acceptable. An empty optional cell is NULL.
# ---------------------------------------------------------------------------
def _text(required=False):
    def check(raw):
        s = (raw or "").strip()
        if not s:
            return (None, "must not be empty") if required else (None, None)
        return _neutralise(s), None
    return check


def _num(cast, lo=None, hi=None):
    kind = "an integer" if cast is int else "a number"

    def check(raw):
        s = (raw or "").strip()
        if not s:
            return None, None
        try:
            v = cast(float(s)) if cast is int else cast(s)
        except ValueError:
            return None, f"must be {kind}"
        if (lo is not None and v < lo) or (hi is not None and v > hi):
            return None, f"must be between {lo} and {hi}"
        return v, None
    return check


def _enum(allowed):
    joined = "/".join(sorted(allowed))

    def check(raw):
        s = (raw or "").strip().upper()
        if not s:
            return None, None
        if s not in allowed:
            return None, f"must be one of {joined}"
        return s, None
    return check


# Columns match db.SCHEMA exactly. `required` mirrors the PRIMARY KEY / NOT NULL
# constraints, so a passing file is a file the database will actually accept.
SPECS = {
    "crews": {
        "pk": "crew_id",
        "required": ["crew_id"],
        "columns": {
            "crew_id": _text(required=True),
            "current_area": _text(),
            "latitude": _num(float, -90, 90),
            "longitude": _num(float, -180, 180),
            "skill_type": _text(),
            "availability": _enum({"AVAILABLE", "ON_JOB", "OFF"}),
            "equipment_capability": _text(),
            "base_response_min": _num(float, 0, 1440),
            "active_assignment": _text(),
        },
    },
    "assets": {
        "pk": "asset_id",
        "required": ["asset_id", "asset_type", "substation_id", "geographic_area"],
        "columns": {
            "asset_id": _text(required=True),
            "asset_type": _text(required=True),
            "substation_id": _text(required=True),
            "geographic_area": _text(required=True),
            "latitude": _num(float, -90, 90),
            "longitude": _num(float, -180, 180),
            "installation_year": _num(int, 1900, 2100),
            "manufacturer": _text(),
            "rated_capacity": _num(float, 0, 1_000_000),
            "criticality_score": _num(float, 0, 100),
            "customers_served": _num(int, 0, 100_000_000),
            "downstream_assets": _num(int, 0, 100_000),
            "last_maintenance_date": _text(),
            "current_status": _text(),
        },
    },
}

KINDS = tuple(SPECS)

# Rejection reasons that are the caller's fault at file level, not row level.
# Raised as ValueError(status, message) and translated to HTTPException by main.
class IngestError(ValueError):
    def __init__(self, status, message):
        super().__init__(message)
        self.status = status
        self.message = message


def decode(raw: bytes) -> str:
    """Bytes -> text, refusing binary and oversized payloads."""
    if len(raw) > config.MAX_UPLOAD_BYTES:
        raise IngestError(413, f"File exceeds the {config.MAX_UPLOAD_BYTES // 1024} KB upload limit")
    if not raw.strip():
        raise IngestError(400, "File is empty")
    if b"\x00" in raw:
        raise IngestError(400, "File is binary, not CSV")
    try:
        # utf-8-sig: spreadsheets love to prepend a BOM to the first header.
        return raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise IngestError(400, "File is not valid UTF-8 text")


def analyse(kind: str, text: str) -> dict:
    """Parse + validate. Returns the report and, separately, the rows to insert."""
    spec = SPECS[kind]
    columns, pk = spec["columns"], spec["pk"]

    reader = csv.DictReader(io.StringIO(text), restkey="__extra__")
    headers = [h.strip() for h in (reader.fieldnames or []) if h and h.strip()]
    if not headers:
        raise IngestError(400, "Could not read a CSV header row — is this really a CSV file?")

    missing = [c for c in spec["required"] if c not in headers]
    if missing:
        raise IngestError(400, f"Missing required column(s): {', '.join(missing)}")

    errors = []
    unknown = [h for h in headers if h not in columns]
    for h in unknown:
        errors.append({"row": 1, "field": h, "value": h,
                       "message": "Unknown column — it will be ignored"})

    known = [h for h in headers if h in columns]
    existing = {r[pk] for r in db.query(f"SELECT {pk} FROM {kind}")}
    seen = set()
    rows, preview = [], []
    total = invalid = duplicates = 0

    for raw_row in reader:
        total += 1
        if total > config.MAX_IMPORT_ROWS:
            raise IngestError(413, f"File has more than {config.MAX_IMPORT_ROWS} rows")
        line = reader.line_num

        row, bad = {}, False
        if raw_row.get("__extra__"):
            errors.append({"row": line, "field": None, "value": None,
                           "message": f"Row has more fields than the header ({len(headers)})"})
            bad = True
        for col in known:
            value, err = columns[col](raw_row.get(col))
            if err:
                errors.append({"row": line, "field": col,
                               "value": raw_row.get(col), "message": err})
                bad = True
            else:
                row[col] = value
        # A header can be present but the row short of it (ragged CSV).
        for col in spec["required"]:
            if row.get(col) is None and not bad:
                errors.append({"row": line, "field": col, "value": None,
                               "message": "must not be empty"})
                bad = True
        if bad:
            invalid += 1
            continue

        key = row[pk]
        if key in seen:
            duplicates += 1
            errors.append({"row": line, "field": pk, "value": key,
                           "message": "Duplicate of an earlier row in this file"})
            continue
        if key in existing:
            duplicates += 1
            errors.append({"row": line, "field": pk, "value": key,
                           "message": "Already exists in the database"})
            continue

        seen.add(key)
        rows.append(row)
        if len(preview) < 5:
            preview.append(row)

    report = {"kind": kind, "total_rows": total, "valid": len(rows), "invalid": invalid,
              "duplicates": duplicates, "imported": 0, "unknown_columns": unknown,
              "errors": errors, "preview": preview}
    return report, rows


def _insert(kind, rows):
    """All-or-nothing write of the already-validated rows."""
    if not rows:
        return 0
    cols = sorted({c for r in rows for c in r})
    sql = (f"INSERT INTO {kind}({','.join(cols)}) "
           f"VALUES({','.join(':' + c for c in cols)})")
    try:
        with db.session() as conn:
            conn.executemany(sql, [{c: r.get(c) for c in cols} for r in rows])
    except sqlite3.Error as exc:
        raise IngestError(409, f"Import failed and was rolled back — no rows written ({exc})")
    return len(rows)


def run(kind: str, raw: bytes, actor: str, commit: bool) -> dict:
    if kind not in SPECS:
        raise IngestError(404, f"Unknown import kind '{kind}'. Valid: {', '.join(KINDS)}")
    report, rows = analyse(kind, decode(raw))
    if commit:
        report["imported"] = _insert(kind, rows)
        db.audit(actor, "ingest_commit",
                 {"kind": kind, "total_rows": report["total_rows"],
                  "imported": report["imported"], "invalid": report["invalid"],
                  "duplicates": report["duplicates"]})
    return report
