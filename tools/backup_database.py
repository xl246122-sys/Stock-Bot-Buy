"""Consistent local SQLite backup; no credentials or row contents are printed."""
import argparse
import json
import sqlite3
from contextlib import closing
from pathlib import Path


def backup(source: Path, destination: Path) -> dict:
    if not source.is_file():
        raise ValueError("source_missing")
    if destination.exists():
        raise ValueError("destination_already_exists")
    destination.parent.mkdir(parents=True, exist_ok=True)
    with closing(sqlite3.connect(source.resolve().as_uri() + "?mode=ro", uri=True)) as src:
        with closing(sqlite3.connect(destination)) as dst:
            src.backup(dst)
            integrity = dst.execute("PRAGMA integrity_check").fetchone()[0]
            if integrity != "ok":
                raise ValueError("backup_integrity_failed")
    return {"status": "ok", "integrity_check": integrity, "bytes": destination.stat().st_size}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--destination", type=Path, required=True)
    args = parser.parse_args()
    print(json.dumps(backup(args.source, args.destination)))
