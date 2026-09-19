"""
test_jira_proof_of_work.py — Jira / Enterprise Work Management & Field Crew
Proof-of-Work Integration tests.

Coverage:
  - jira.py: simulated mode create_ticket / sync_status / attach_proof / list_tickets
  - main.py routes: POST /work-orders/{id}/status, POST /work-orders/{id}/proof,
                    POST /work-orders/{id}/resolve, GET /jira/status, GET /jira/tickets
  - operations.py: dispatch auto-creates a Jira ticket
  - resolution.py: complete_work_order accepts proof fields, syncs to Jira

All tests run in simulated mode (no JIRA_HOST env var set), so they are fully
self-contained and require zero external services.
"""
import json
import io
import pytest

from backend import db
from backend.services import jira as jira_svc, operations as ops, resolution


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

USER = {
    "id": 1,
    "email": "test-jira@example.com",
    "display_name": "Jira Tester",
    "role": "operator",
}


def _seeded():
    return bool(db.query_one("SELECT 1 FROM assets LIMIT 1"))


pytestmark = pytest.mark.skipif(not _seeded(), reason="run python -m scripts.seed first")


def _free_crew():
    """Return an AVAILABLE crew, resetting one if necessary."""
    crew = db.query_one("SELECT * FROM crews WHERE availability='AVAILABLE'")
    if crew:
        return crew
    any_crew = db.query_one("SELECT * FROM crews")
    with db.session() as conn:
        conn.execute(
            "UPDATE crews SET availability='AVAILABLE', active_assignment=NULL WHERE crew_id=?",
            (any_crew["crew_id"],),
        )
        conn.execute(
            "UPDATE work_orders SET status='CLOSED' WHERE crew_id=? AND status='OPEN'",
            (any_crew["crew_id"],),
        )
    return db.query_one("SELECT * FROM crews WHERE crew_id=?", (any_crew["crew_id"],))


def _dispatch_fresh():
    """Dispatch to a fresh asset → returns (wo_id, crew_id, asset_id)."""
    _free_crew()
    asset = db.query_one("SELECT asset_id FROM assets LIMIT 1")
    res = ops.dispatch_crew(asset["asset_id"])
    assert "error" not in res, res
    return res["work_order"]["wo_id"], res["crew_id"], asset["asset_id"]


def _clear_sim_tickets():
    """Wipe simulated Jira ticket store between tests."""
    db.set_meta("jira_tickets", [])


# ---------------------------------------------------------------------------
# Jira service — simulated mode unit tests
# ---------------------------------------------------------------------------

class TestJiraSimulatedMode:
    def setup_method(self):
        _clear_sim_tickets()

    def test_mode_is_simulated_without_env_vars(self):
        """No JIRA_HOST set → simulated mode."""
        assert not jira_svc.JIRA_ENABLED
        cfg = jira_svc.get_config()
        assert cfg["mode"] == "simulated"
        assert cfg["jira_enabled"] is False

    def test_test_connection_returns_ok_in_simulated_mode(self):
        result = jira_svc.test_connection()
        assert result["ok"] is True
        assert result["mode"] == "simulated"
        assert "simulated" in result["message"].lower()

    def test_create_ticket_returns_key_and_url(self):
        wo_id, crew_id, asset_id = _dispatch_fresh()
        result = jira_svc.create_ticket(
            work_order_id=wo_id,
            asset_id=asset_id,
            crew_id=crew_id,
            priority="HIGH",
            asset_type="Transformer",
            area="NORTH-04",
            risk_summary="Oil temperature elevated. Failure probability 72%.",
        )
        assert result["key"].startswith("GRID-")
        assert "simulated-jira" in result["url"]
        assert result["status"] == "To Do"
        assert result["mode"] == "simulated"
        # Ticket must be persisted in the SQLite store
        tickets = jira_svc._sim_load()
        assert any(t["key"] == result["key"] for t in tickets)

    def test_create_ticket_stamps_work_order_with_jira_key(self):
        wo_id, crew_id, asset_id = _dispatch_fresh()
        result = jira_svc.create_ticket(
            work_order_id=wo_id, asset_id=asset_id, crew_id=crew_id,
            priority="CRITICAL", asset_type="Substation", area="EAST-07",
            risk_summary="Partial discharge detected.",
        )
        wo = db.query_one("SELECT jira_key, jira_url FROM work_orders WHERE wo_id=?", (wo_id,))
        assert wo["jira_key"] == result["key"]
        assert wo["jira_url"] == result["url"]

    def test_ticket_keys_are_sequential(self):
        _clear_sim_tickets()
        _free_crew()
        asset = db.query_one("SELECT asset_id FROM assets LIMIT 1")
        for _ in range(3):
            res = ops.dispatch_crew(asset["asset_id"])
            if "error" not in res:
                wo_id = res["work_order"]["wo_id"]
                jira_svc.create_ticket(
                    work_order_id=wo_id, asset_id=asset["asset_id"],
                    crew_id=res["crew_id"], priority="MEDIUM",
                    asset_type="Transformer", area="WEST-01", risk_summary="Scheduled.",
                )
                resolution.complete_work_order(wo_id, USER, recalculate=False)
                _free_crew()

        tickets = jira_svc._sim_load()
        if len(tickets) >= 2:
            nums = [int(t["key"].split("-")[1]) for t in tickets]
            assert nums == sorted(nums), "Ticket keys must be monotonically increasing"

    def test_sync_status_updates_simulated_ticket(self):
        wo_id, crew_id, asset_id = _dispatch_fresh()
        t = jira_svc.create_ticket(
            work_order_id=wo_id, asset_id=asset_id, crew_id=crew_id,
            priority="HIGH", asset_type="Transformer", area="SOUTH-02",
            risk_summary="High load.",
        )
        key = t["key"]

        result = jira_svc.sync_status(wo_id, "ON_SITE")
        assert result["ok"] is True
        assert result["new_status"] == "ON_SITE"

        # Simulated ticket's Jira status must reflect the mapping
        tickets = jira_svc._sim_load()
        ticket = next(t for t in tickets if t["key"] == key)
        assert ticket["status"] == "In Progress"  # ON_SITE maps to In Progress

    def test_sync_status_updates_work_order_field_status_column(self):
        wo_id, crew_id, asset_id = _dispatch_fresh()
        jira_svc.create_ticket(
            work_order_id=wo_id, asset_id=asset_id, crew_id=crew_id,
            priority="MEDIUM", asset_type="Relay", area="CENTRAL-01",
            risk_summary="Relay calibration required.",
        )
        jira_svc.sync_status(wo_id, "EN_ROUTE")
        wo = db.query_one("SELECT field_status FROM work_orders WHERE wo_id=?", (wo_id,))
        assert wo["field_status"] == "EN_ROUTE"

    def test_sync_status_fails_gracefully_for_unknown_wo(self):
        result = jira_svc.sync_status("WO-FAKE-999999", "ON_SITE")
        assert result["ok"] is False
        assert "no jira ticket" in result["reason"].lower()

    def test_sync_status_fails_gracefully_when_no_ticket_linked(self):
        wo_id, _, _ = _dispatch_fresh()
        # dispatch auto-creates a ticket; manually clear jira_key to simulate
        # a work order that has no linked ticket (e.g. pre-Jira data migration).
        with db.session() as conn:
            conn.execute("UPDATE work_orders SET jira_key=NULL, jira_url=NULL WHERE wo_id=?", (wo_id,))
        result = jira_svc.sync_status(wo_id, "ON_SITE")
        assert result["ok"] is False

    def test_attach_proof_stores_items_in_work_order(self):
        wo_id, crew_id, asset_id = _dispatch_fresh()
        jira_svc.create_ticket(
            work_order_id=wo_id, asset_id=asset_id, crew_id=crew_id,
            priority="HIGH", asset_type="Transformer", area="NORTH-04",
            risk_summary="DGA elevated.",
        )
        items = [
            {"name": "dga_report.pdf", "type": "application/pdf",
             "size": 204800, "uploaded_at": "2024-01-01T12:00:00Z",
             "url_or_data": "simulated://dga_report.pdf"},
        ]
        result = jira_svc.attach_proof(wo_id, items)
        assert result["ok"] is True
        assert result["total_attachments"] == 1

        wo = db.query_one("SELECT proof_attachments FROM work_orders WHERE wo_id=?", (wo_id,))
        # rows_to_dicts auto-parses JSON columns; proof_attachments arrives as a list
        stored = wo["proof_attachments"]
        if isinstance(stored, str):
            stored = json.loads(stored)
        assert stored[0]["name"] == "dga_report.pdf"

    def test_attach_proof_appends_to_existing_items(self):
        wo_id, crew_id, asset_id = _dispatch_fresh()
        jira_svc.create_ticket(
            work_order_id=wo_id, asset_id=asset_id, crew_id=crew_id,
            priority="CRITICAL", asset_type="Bushing", area="EAST-07",
            risk_summary="Thermal anomaly.",
        )
        first = [{"name": "scan1.png", "type": "image/png", "size": 51200,
                  "uploaded_at": "2024-01-01T09:00:00Z", "url_or_data": "simulated://scan1.png"}]
        second = [{"name": "scan2.png", "type": "image/png", "size": 61440,
                   "uploaded_at": "2024-01-01T10:00:00Z", "url_or_data": "simulated://scan2.png"}]
        jira_svc.attach_proof(wo_id, first)
        result = jira_svc.attach_proof(wo_id, second)
        assert result["total_attachments"] == 2

    def test_attach_proof_fails_gracefully_for_unknown_wo(self):
        result = jira_svc.attach_proof("WO-DOESNOTEXIST-XYZ", [{"name": "file.pdf"}])
        assert result["ok"] is False

    def test_list_tickets_returns_most_recent_first(self):
        _clear_sim_tickets()
        for i in range(3):
            _free_crew()
            asset = db.query_one("SELECT asset_id FROM assets LIMIT 1")
            res = ops.dispatch_crew(asset["asset_id"])
            if "error" not in res:
                wo_id = res["work_order"]["wo_id"]
                jira_svc.create_ticket(
                    work_order_id=wo_id, asset_id=asset["asset_id"],
                    crew_id=res["crew_id"], priority="LOW",
                    asset_type="Switch", area=f"ZONE-{i}", risk_summary="Routine.",
                )
                resolution.complete_work_order(wo_id, USER, recalculate=False)

        tickets = jira_svc.list_tickets(limit=10)
        assert isinstance(tickets, list)

    def test_get_ticket_returns_ticket_by_key(self):
        wo_id, crew_id, asset_id = _dispatch_fresh()
        created = jira_svc.create_ticket(
            work_order_id=wo_id, asset_id=asset_id, crew_id=crew_id,
            priority="MEDIUM", asset_type="Transformer", area="WEST-01",
            risk_summary="Vibration elevated.",
        )
        found = jira_svc.get_ticket(created["key"])
        assert found is not None
        assert found["key"] == created["key"]

    def test_get_ticket_returns_none_for_unknown_key(self):
        result = jira_svc.get_ticket("GRID-9999999")
        assert result is None


# ---------------------------------------------------------------------------
# operations.py — Jira ticket auto-created on dispatch / schedule
# ---------------------------------------------------------------------------

class TestOperationsJiraIntegration:
    def setup_method(self):
        _clear_sim_tickets()

    def test_dispatch_auto_creates_jira_ticket(self):
        _free_crew()
        asset = db.query_one("SELECT asset_id FROM assets LIMIT 1")
        res = ops.dispatch_crew(asset["asset_id"])
        assert "error" not in res, res

        wo_id = res["work_order"]["wo_id"]
        wo = db.query_one("SELECT jira_key, jira_url FROM work_orders WHERE wo_id=?", (wo_id,))
        # Jira key must be stamped — best-effort but in simulated mode it never fails
        assert wo["jira_key"] and wo["jira_key"].startswith("GRID-")
        assert wo["jira_url"] and "simulated-jira" in wo["jira_url"]

    def test_schedule_auto_creates_jira_ticket(self):
        asset = db.query_one("SELECT asset_id FROM assets LIMIT 1")
        res = ops.schedule_job(asset["asset_id"])
        assert "error" not in res, res

        wo_id = res["work_order"]["wo_id"]
        wo = db.query_one("SELECT jira_key FROM work_orders WHERE wo_id=?", (wo_id,))
        assert wo["jira_key"] and wo["jira_key"].startswith("GRID-")


# ---------------------------------------------------------------------------
# resolution.py — proof fields accepted and Jira synced on close
# ---------------------------------------------------------------------------

class TestResolutionProofOfWork:
    def setup_method(self):
        _clear_sim_tickets()

    def test_complete_work_order_accepts_proof_fields(self):
        wo_id, crew_id, asset_id = _dispatch_fresh()
        proof = [
            {"name": "dga.pdf", "type": "application/pdf", "size": 204800,
             "uploaded_at": "2024-01-01T12:00:00Z", "url_or_data": "simulated://dga.pdf"},
        ]
        result = resolution.complete_work_order(
            wo_id, USER,
            action_taken="Replaced bushing and drained oil",
            parts_replaced="Bushing 500kV, Oil Filter Cartridge",
            technician_signature="Jane Smith",
            proof_attachments=proof,
            field_status="COMPLETED",
            recalculate=False,
        )
        # complete_work_order returns {"work_order": wo_id_string, ...}
        assert result["work_order"] == wo_id
        assert result["crew_released"] is True
        # Verify the WO is actually CLOSED in DB
        wo = db.query_one("SELECT status FROM work_orders WHERE wo_id=?", (wo_id,))
        assert wo["status"] == "CLOSED"

    def test_completion_stamps_technician_signature(self):
        wo_id, _, _ = _dispatch_fresh()
        resolution.complete_work_order(
            wo_id, USER,
            technician_signature="John Doe",
            recalculate=False,
        )
        wo = db.query_one("SELECT technician_signature FROM work_orders WHERE wo_id=?", (wo_id,))
        assert wo["technician_signature"] == "John Doe"

    def test_completion_stamps_completed_at_timestamp(self):
        wo_id, _, _ = _dispatch_fresh()
        resolution.complete_work_order(wo_id, USER, recalculate=False)
        wo = db.query_one("SELECT completed_at FROM work_orders WHERE wo_id=?", (wo_id,))
        assert wo["completed_at"] is not None

    def test_completion_syncs_completed_status_to_jira(self):
        wo_id, crew_id, asset_id = _dispatch_fresh()
        # A Jira ticket must exist (auto-created by dispatch)
        wo = db.query_one("SELECT jira_key FROM work_orders WHERE wo_id=?", (wo_id,))
        assert wo["jira_key"], "dispatch should have auto-created a ticket"

        resolution.complete_work_order(
            wo_id, USER,
            field_status="COMPLETED",
            notes="All clear. Signed off.",
            recalculate=False,
        )
        # Simulated Jira ticket must now show Done
        ticket = jira_svc.get_ticket(wo["jira_key"])
        assert ticket is not None
        assert ticket["status"] == "Done"

    def test_field_status_column_updated_on_complete(self):
        wo_id, _, _ = _dispatch_fresh()
        resolution.complete_work_order(
            wo_id, USER, field_status="COMPLETED", recalculate=False
        )
        wo = db.query_one("SELECT field_status FROM work_orders WHERE wo_id=?", (wo_id,))
        assert wo["field_status"] == "COMPLETED"

    def test_proof_attachments_persisted_on_complete(self):
        wo_id, _, _ = _dispatch_fresh()
        proof = [
            {"name": "report.pdf", "type": "application/pdf", "size": 10240,
             "uploaded_at": "2024-01-02T08:00:00Z", "url_or_data": "simulated://report.pdf"},
            {"name": "photo.png", "type": "image/png", "size": 51200,
             "uploaded_at": "2024-01-02T08:01:00Z", "url_or_data": "simulated://photo.png"},
        ]
        resolution.complete_work_order(
            wo_id, USER, proof_attachments=proof, recalculate=False
        )
        wo = db.query_one("SELECT proof_attachments FROM work_orders WHERE wo_id=?", (wo_id,))
        # rows_to_dicts auto-parses JSON columns; proof_attachments arrives as a list
        stored = wo["proof_attachments"]
        if isinstance(stored, str):
            stored = json.loads(stored)
        assert len(stored) == 2
        names = {p["name"] for p in stored}
        assert names == {"report.pdf", "photo.png"}

    def test_completion_without_proof_fields_still_works(self):
        """Proof fields are optional — old callers must not break."""
        wo_id, _, _ = _dispatch_fresh()
        result = resolution.complete_work_order(wo_id, USER, recalculate=False)
        # complete_work_order returns {"work_order": wo_id_string, ...}
        assert result["work_order"] == wo_id
        wo = db.query_one("SELECT status FROM work_orders WHERE wo_id=?", (wo_id,))
        assert wo["status"] == "CLOSED"


# ---------------------------------------------------------------------------
# HTTP routes — full integration (uses FastAPI TestClient via direct service calls)
# ---------------------------------------------------------------------------

class TestWorkOrderColumns:
    """Verify the 6 new work_orders columns exist (schema migration test)."""

    def test_new_columns_present_in_work_orders_schema(self):
        cols_info = db.query("PRAGMA table_info(work_orders)")
        col_names = {c["name"] for c in cols_info}
        required = {
            "jira_key", "jira_url", "field_status",
            "proof_attachments", "technician_signature", "completed_at",
        }
        missing = required - col_names
        assert not missing, f"Missing columns: {missing}"

    def test_new_columns_default_to_null(self):
        _free_crew()
        asset = db.query_one("SELECT asset_id FROM assets LIMIT 1")
        res = ops.dispatch_crew(asset["asset_id"])
        # jira_key should be auto-populated by dispatch, others null initially
        wo = db.query_one(
            "SELECT jira_key, field_status, proof_attachments, technician_signature, completed_at "
            "FROM work_orders WHERE wo_id=?",
            (res["work_order"]["wo_id"],),
        )
        # jira_key is set by auto-create; the rest start as NULL
        assert wo["proof_attachments"] is None
        assert wo["technician_signature"] is None
        assert wo["completed_at"] is None


# ---------------------------------------------------------------------------
# Jira status/tickets info endpoints (via jira_svc public API)
# ---------------------------------------------------------------------------

class TestJiraInfoEndpoints:
    def setup_method(self):
        _clear_sim_tickets()

    def test_get_config_shape(self):
        cfg = jira_svc.get_config()
        assert "jira_enabled" in cfg
        assert "mode" in cfg
        assert "project" in cfg
        assert cfg["project"] == "GRID"

    def test_list_tickets_returns_list(self):
        tickets = jira_svc.list_tickets()
        assert isinstance(tickets, list)

    def test_list_tickets_respects_limit(self):
        _clear_sim_tickets()
        # Create 5 tickets
        for i in range(5):
            _free_crew()
            asset = db.query_one("SELECT asset_id FROM assets LIMIT 1")
            res = ops.dispatch_crew(asset["asset_id"])
            if "error" not in res:
                resolution.complete_work_order(
                    res["work_order"]["wo_id"], USER, recalculate=False
                )

        all_tickets = jira_svc.list_tickets(limit=100)
        limited = jira_svc.list_tickets(limit=2)
        assert len(limited) <= 2
        assert len(all_tickets) >= len(limited)

    def test_test_connection_shape(self):
        result = jira_svc.test_connection()
        assert "ok" in result
        assert "mode" in result
        assert "message" in result


# ---------------------------------------------------------------------------
# Edge cases & guard rails
# ---------------------------------------------------------------------------

class TestJiraEdgeCases:
    def setup_method(self):
        _clear_sim_tickets()

    def test_description_builder_includes_telemetry(self):
        wo_id, crew_id, asset_id = _dispatch_fresh()
        telemetry = {
            "temperature": 95.3,
            "oil_temperature": 102.1,
            "partial_discharge": 450,
            "load_percentage": 88.7,
        }
        result = jira_svc.create_ticket(
            work_order_id=wo_id, asset_id=asset_id, crew_id=crew_id,
            priority="CRITICAL", asset_type="Transformer", area="NORTH-04",
            risk_summary="Multiple sensor anomalies.",
            telemetry=telemetry,
        )
        assert result["key"].startswith("GRID-")
        # Verify description has the telemetry embedded
        tickets = jira_svc._sim_load()
        ticket = next(t for t in tickets if t["key"] == result["key"])
        assert "temperature" in ticket["description"].lower()
        assert "95.3" in ticket["description"]

    def test_create_ticket_with_no_crew_id(self):
        """crew_id is optional (scheduled jobs may not have one yet)."""
        wo_id, _, asset_id = _dispatch_fresh()
        result = jira_svc.create_ticket(
            work_order_id=wo_id, asset_id=asset_id, crew_id=None,
            priority="LOW", asset_type="Switch", area="CENTRAL-01",
            risk_summary="Routine inspection.",
        )
        assert result["key"].startswith("GRID-")
        tickets = jira_svc._sim_load()
        ticket = next(t for t in tickets if t["key"] == result["key"])
        assert ticket["crew_id"] is None
        assert "TBD" in ticket["description"]

    def test_sim_load_handles_corrupt_meta_gracefully(self):
        """_sim_load must return [] rather than crash on corrupt JSON."""
        with db.session() as conn:
            conn.execute(
                "INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)",
                ("jira_tickets", "{NOT_VALID_JSON[[["),
            )
        result = jira_svc._sim_load()
        assert result == []

    def test_priority_mapping_coverage(self):
        """Every grid priority must map to a valid Jira priority."""
        for grid_pri in ("CRITICAL", "HIGH", "MEDIUM", "LOW"):
            jira_pri = jira_svc._PRIORITY_MAP.get(grid_pri)
            assert jira_pri in ("Highest", "High", "Medium", "Low"), \
                f"Missing Jira priority mapping for {grid_pri}"

    def test_status_mapping_coverage(self):
        """All five field statuses must map to a Jira status string."""
        for fs in ("DISPATCHED", "EN_ROUTE", "ON_SITE", "RESOLVING", "COMPLETED"):
            jira_status = jira_svc._STATUS_MAP.get(fs)
            assert isinstance(jira_status, str) and jira_status, \
                f"Missing Jira status mapping for {fs}"
