"""Atomic plan revisions and a shadow-only outbox. No external transport exists here."""
import hashlib
import json
import math
from dataclasses import asdict, dataclass
from uuid import uuid4

from .ai_store import AIStore


def encode(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False)


@dataclass(frozen=True)
class PlanPolicy:
    anchor_tolerance_bps: float = 25
    price_change_bps: float = 10
    capacity: int = 2000
    max_attempts: int = 5

    def __post_init__(self):
        if (not all(not isinstance(v,bool) and isinstance(v,(float,int))
                    and math.isfinite(v) and 0 <= v <= 1000 for v in
                    (self.anchor_tolerance_bps, self.price_change_bps))
                or type(self.capacity) is not int or type(self.max_attempts) is not int
                or not 2 <= self.capacity <= 100000 or not 1 <= self.max_attempts <= 10):
            raise ValueError("invalid_plan_policy")


class PlanStore:
    def __init__(self, audit: AIStore, policy=PlanPolicy()):
        self.audit, self.policy = audit, policy
        with audit.connection() as db:
            db.executescript("""
                CREATE TABLE IF NOT EXISTS signal_setups(
                    setup_id TEXT PRIMARY KEY, identity TEXT NOT NULL, signal_id TEXT UNIQUE NOT NULL,
                    anchors TEXT NOT NULL, status TEXT NOT NULL, revision INTEGER NOT NULL,
                    valid_until INTEGER NOT NULL, created_at INTEGER NOT NULL);
                CREATE UNIQUE INDEX IF NOT EXISTS one_active_setup ON signal_setups(identity)
                    WHERE status='active';
                CREATE TABLE IF NOT EXISTS signal_revisions(
                    setup_id TEXT NOT NULL, revision INTEGER NOT NULL, at INTEGER NOT NULL,
                    kind TEXT NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(setup_id,revision));
                CREATE TABLE IF NOT EXISTS plan_observations(
                    cycle_id TEXT NOT NULL, symbol TEXT NOT NULL, fingerprint TEXT NOT NULL,
                    result TEXT NOT NULL, PRIMARY KEY(cycle_id,symbol));
                CREATE TABLE IF NOT EXISTS plan_cursor(
                    identity TEXT PRIMARY KEY, source_time INTEGER NOT NULL, validated_at INTEGER NOT NULL);
                CREATE TABLE IF NOT EXISTS notification_outbox(
                    task_id TEXT PRIMARY KEY, setup_id TEXT NOT NULL, signal_id TEXT NOT NULL,
                    revision INTEGER NOT NULL, channel TEXT NOT NULL, kind TEXT NOT NULL,
                    mode TEXT NOT NULL CHECK(mode='shadow'), state TEXT NOT NULL,
                    payload TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
                    available_at INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
                    lease_token TEXT, lease_until INTEGER, last_error TEXT,
                    UNIQUE(signal_id,revision,channel));
                CREATE INDEX IF NOT EXISTS outbox_ready ON notification_outbox(channel,state,available_at);
            """)

    def _expire(self, db, now):
        db.execute("UPDATE notification_outbox SET state='expired',lease_token=NULL,lease_until=NULL "
                   "WHERE state IN ('pending','retry','leased') AND expires_at<=?", (now,))
        db.execute("UPDATE signal_setups SET status='expired' WHERE status='active' AND valid_until<=?", (now,))

    def _queue(self, db, setup, revision, kind, payload, now, expiry):
        count = db.execute("SELECT COUNT(*) FROM notification_outbox "
                           "WHERE state IN ('pending','retry','leased')").fetchone()[0]
        if count+2 > self.policy.capacity:
            raise ValueError("notification_queue_full")
        for channel in ("fcm", "web"):
            db.execute("""INSERT INTO notification_outbox
                (task_id,setup_id,signal_id,revision,channel,kind,mode,state,payload,
                 created_at,expires_at,available_at) VALUES(?,?,?,?,?,?,'shadow','pending',?,?,?,?)""",
                       (str(uuid4()), setup[0], setup[2], revision, channel, kind,
                        encode(payload), now, expiry, now))

    def _cancel_pending(self, db, setup_id):
        db.execute("UPDATE notification_outbox SET state='superseded',lease_token=NULL,lease_until=NULL "
                   "WHERE setup_id=? AND state IN ('pending','retry','leased')", (setup_id,))

    def _terminal(self, db, setup, now, reason, event):
        revision = setup[5]+1
        self._cancel_pending(db, setup[0])
        payload = {"setup_id": setup[0], "signal_id": setup[2], "revision": revision,
                   "kind": "plan_invalidated", "reason": reason, "symbol": event["symbol"],
                   "cycle_id": event["cycle_id"], "buy_enabled": False}
        db.execute("INSERT INTO signal_revisions VALUES(?,?,?,?,?)",
                   (setup[0], revision, now, "plan_invalidated", encode(payload)))
        db.execute("UPDATE signal_setups SET status=?,revision=? WHERE setup_id=?",
                   (reason, revision, setup[0]))
        self._queue(db, setup, revision, "plan_invalidated", payload, now, now+60000)

    @staticmethod
    def _anchors(snapshot):
        p = snapshot.get("periods", {}).get("15m", {})
        values = [p.get("support_20"), p.get("resistance_20")]
        if (p.get("status") != "ready" or
                any(isinstance(v, bool) or not isinstance(v, (int, float))
                    or not math.isfinite(v) or v <= 0 for v in values) or values[0] >= values[1]):
            return None
        return values

    @staticmethod
    def _near(a, b, bps):
        return len(a)==len(b) and all(abs(x-y)/y*10000 <= bps for x,y in zip(a,b))

    def record(self, event: dict, snapshot: dict) -> dict:
        """Only called after business validation. Audit, revision and tasks commit together."""
        now, symbol = event["validated_at"], event["symbol"]
        if (symbol != snapshot["symbol"] or event["snapshot_id"] != snapshot["snapshot_id"]
                or snapshot["as_of"] > now):
            raise ValueError("plan_snapshot_mismatch")
        identity = encode([snapshot["feed"], snapshot["currency"], symbol, "LONG", "support_resistance_15m_v1"])
        fingerprint = hashlib.sha256(encode({"event":event,"snapshot":snapshot}).encode()).hexdigest()
        raw = event["decision"]
        with self.audit.connection() as db:
            db.execute("BEGIN IMMEDIATE")
            prior = db.execute("SELECT fingerprint,result FROM plan_observations WHERE cycle_id=? AND symbol=?",
                               (event["cycle_id"], symbol)).fetchone()
            if prior:
                if prior[0] != fingerprint:
                    raise ValueError("observation_id_conflict")
                return json.loads(prior[1])
            self._expire(db, now)
            cursor = db.execute("SELECT source_time,validated_at FROM plan_cursor WHERE identity=?", (identity,)).fetchone()
            result = {"status": "no_active_plan", "setup_id": None, "signal_id": None, "revision": None,
                      "delivery": "shadow_queue_only"}
            source = (snapshot["as_of"], now)
            setup = db.execute("SELECT * FROM signal_setups WHERE identity=? AND status='active'", (identity,)).fetchone()
            if cursor and source <= cursor:
                result["status"] = "out_of_order_ignored"
            else:
                db.execute("INSERT OR REPLACE INTO plan_cursor VALUES(?,?,?)", (identity, *source))
                if raw["decision"] in ("WAIT", "AVOID"):
                    if setup:
                        self._terminal(db, setup, now, "withdrawn", event)
                        result.update(status="withdrawn", setup_id=setup[0], signal_id=setup[2], revision=setup[5]+1)
                else:
                    anchors = self._anchors(snapshot)
                    if anchors is None:
                        result["status"] = "missing_structure_anchors"
                    elif not isinstance(event["valid_until"], int) or event["valid_until"] <= now:
                        raise ValueError("expired_plan")
                    else:
                        if setup and not self._near(anchors, json.loads(setup[3]), self.policy.anchor_tolerance_bps):
                            self._terminal(db, setup, now, "structure_changed", event)
                            setup = None
                        if setup is None:
                            setup_id, signal_id = str(uuid4()), str(uuid4())
                            setup = (setup_id, identity, signal_id, encode(anchors), "active", 0,
                                     event["valid_until"], now)
                            db.execute("INSERT INTO signal_setups VALUES(?,?,?,?,?,?,?,?)", setup)
                        revision = setup[5]
                        previous = db.execute("SELECT payload FROM signal_revisions WHERE setup_id=? AND revision=?",
                                              (setup[0], revision)).fetchone()
                        changed = not previous
                        if previous:
                            previous_payload = json.loads(previous[0])
                            old, new = previous_payload["decision"]["plan"], raw["plan"]
                            prices = lambda p: [p["entry_low"],p["entry_high"],p["stop_loss"],*p["take_profits"]]
                            changed = (not self._near(prices(new), prices(old), self.policy.price_change_bps)
                                       or new["holding_minutes"] != old["holding_minutes"]
                                       or new["invalidation_conditions"] != old["invalidation_conditions"]
                                       or event["valid_until"] < setup[6])
                        expiry = min(setup[6], event["valid_until"])  # Repeated BUY never extends life.
                        if changed:
                            revision += 1
                            payload = {**event, "setup_id": setup[0], "signal_id": setup[2],
                                       "revision": revision, "valid_until": expiry,
                                       "source_time": snapshot["as_of"], "identity": json.loads(identity),
                                       "dedup_policy": asdict(self.policy), "buy_enabled": False}
                            self._cancel_pending(db, setup[0])
                            db.execute("INSERT INTO signal_revisions VALUES(?,?,?,?,?)",
                                       (setup[0], revision, now, "buy_plan", encode(payload)))
                            db.execute("UPDATE signal_setups SET revision=?,valid_until=? WHERE setup_id=?",
                                       (revision, expiry, setup[0]))
                            self._queue(db, setup, revision, "buy_plan", payload, now, expiry)
                        result.update(status="revised" if changed and revision>1 else "created" if changed else "duplicate_suppressed",
                                      setup_id=setup[0], signal_id=setup[2], revision=revision, valid_until=expiry)
            audited = {**event, "plan_tracking": result}
            db.execute("INSERT INTO ai_audit VALUES(?,?,?,?,?)",
                       (str(uuid4()), event["cycle_id"], "validated_decision", now, encode(audited)))
            db.execute("INSERT INTO plan_observations VALUES(?,?,?,?)",
                       (event["cycle_id"], symbol, fingerprint, encode(result)))
            return result

    def claim(self, channel: str, *, now: int, lease_ms: int = 30000):
        if channel not in {"fcm","web"} or not 1000 <= lease_ms <= 60000:
            raise ValueError("invalid_claim")
        with self.audit.connection() as db:
            db.execute("BEGIN IMMEDIATE")
            self._expire(db, now)
            db.execute("UPDATE notification_outbox SET state='failed',lease_token=NULL,lease_until=NULL "
                       "WHERE state='leased' AND lease_until<=? AND attempts>=?", (now, self.policy.max_attempts))
            row = db.execute("""SELECT task_id,payload,expires_at,attempts FROM notification_outbox
                WHERE channel=? AND mode='shadow' AND expires_at>? AND available_at<=?
                AND (state IN ('pending','retry') OR (state='leased' AND lease_until<=?))
                ORDER BY CASE kind WHEN 'plan_invalidated' THEN 0 ELSE 1 END,created_at,task_id LIMIT 1""",
                             (channel, now, now, now)).fetchone()
            if not row:
                return None
            token = str(uuid4())
            until = min(now+lease_ms,row[2])
            db.execute("UPDATE notification_outbox SET state='leased',lease_token=?,lease_until=?,attempts=attempts+1 "
                       "WHERE task_id=?", (token, until, row[0]))
            return {"task_id":row[0], "lease_token":token, "lease_until":until,
                    "attempt":row[3]+1, "payload":json.loads(row[1]), "mode":"shadow"}

    def finish_shadow(self, task_id: str, token: str, *, now: int, success: bool):
        """CAS lease fencing; success records a local dry run, never a delivery receipt."""
        with self.audit.connection() as db:
            db.execute("BEGIN IMMEDIATE")
            self._expire(db, now)
            row = db.execute("SELECT state,lease_token,lease_until,attempts,expires_at FROM notification_outbox "
                             "WHERE task_id=?", (task_id,)).fetchone()
            if not row or row[0]!="leased" or row[1]!=token or row[2]<=now:
                raise ValueError("stale_or_invalid_lease")
            retry_at = now+min(60000,1000*2**(row[3]-1))
            state = ("dry_run_completed" if success else
                     "failed" if row[3]>=self.policy.max_attempts else
                     "expired" if retry_at>=row[4] else "retry")
            db.execute("UPDATE notification_outbox SET state=?,available_at=?,lease_token=NULL,lease_until=NULL,"
                       "last_error=? WHERE task_id=?",
                       (state,retry_at,None if success else "shadow_processing_failed",task_id))
            return state

    def summary(self):
        with self.audit.connection() as db:
            return {"mode":"shadow", "external_delivery_enabled":False,
                    "plans":dict(db.execute("SELECT status,COUNT(*) FROM signal_setups GROUP BY status")),
                    "tasks":dict(db.execute("SELECT state,COUNT(*) FROM notification_outbox GROUP BY state"))}

    def history(self, signal_id: str) -> dict:
        with self.audit.connection() as db:
            row = db.execute("SELECT setup_id,status,revision,valid_until FROM signal_setups WHERE signal_id=?",
                             (signal_id,)).fetchone()
            if not row:
                return {"signal_id":signal_id, "found":False}
            versions = db.execute("SELECT revision,at,kind,payload FROM signal_revisions "
                                  "WHERE setup_id=? ORDER BY revision", (row[0],)).fetchall()
            return {"signal_id":signal_id, "found":True, "setup_id":row[0], "status":row[1],
                    "revision":row[2], "valid_until":row[3],
                    "history":[{"revision":v[0],"at":v[1],"kind":v[2],"payload":json.loads(v[3])} for v in versions]}
