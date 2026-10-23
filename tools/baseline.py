"""Create an allowlisted source archive; never copy credentials or live databases."""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import zipfile
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE_ROOTS = ("src", "app/src/main", "docs", "gradle", "tools", "tests", "server/v2")
ROOT_FILES = (
    "package.json", "package-lock.json", "bun.lock", "tsconfig.json",
    "vite.config.ts", "index.html", "README.md", ".gitignore",
    "build.gradle.kts", "settings.gradle.kts", "gradle.properties",
    "gradlew.bat", "version.properties", "app/build.gradle.kts", ".env.example",
    "app/proguard-rules.pro",
)
SECRET_PATTERNS = (
    re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
    re.compile(r"\b(?:sk-[A-Za-z0-9_-]{16,}|AIza[A-Za-z0-9_-]{25,})\b"),
    re.compile(
        r"""(?im)(?:password|passwd|api[_-]?key|secret|access_token)\s*[:=]\s*["']([^"'\r\n]{12,})["']"""
    ),
)


def candidates(root: Path):
    files = {root / name for name in ROOT_FILES}
    for name in SOURCE_ROOTS:
        folder = root / name
        if folder.exists():
            files.update(p for p in folder.rglob("*") if p.is_file())
    # Existing deployment helpers can embed SSH credentials: intentionally excluded.
    files.update(p for p in (root / "server").glob("*.py")
                 if p.name not in {"deploy.py", "setup_nginx.py"})
    files.update(root / "server" / name for name in ("requirements.txt", "stock-g.service"))
    for p in sorted(files):
        if not p.is_file() or p.is_symlink():
            continue
        rel = p.relative_to(root)
        if any(part in {"assets", "__pycache__", "credentials", ".git"} for part in rel.parts):
            continue
        if p.suffix.lower() in {".pyc", ".db", ".pem", ".key", ".jks", ".keystore"}:
            continue
        yield p


def create_baseline(root: Path, destination: Path):
    destination.mkdir(parents=True, exist_ok=False)
    manifest, excluded = [], []
    with zipfile.ZipFile(destination / "source.zip", "w", zipfile.ZIP_DEFLATED) as archive:
        for path in candidates(root):
            data = path.read_bytes()
            text = data.decode("utf-8", errors="replace")
            rel = path.relative_to(root).as_posix()
            if any(pattern.search(text) for pattern in SECRET_PATTERNS):
                excluded.append({"path": rel, "reason": "potential_secret_requires_review"})
                continue
            manifest.append({"path": rel, "sha256": hashlib.sha256(data).hexdigest(),
                             "bytes": len(data)})
            archive.writestr(rel, data)
    report = {
        "created_at": datetime.now(timezone.utc).isoformat(),
        "kind": "source_only_not_database_or_credentials_backup",
        "files": manifest,
        "excluded_for_review": excluded,
        "explicit_exclusions": [
            ".env*", "SBKEY", "server/credentials", "server/data",
            "server/deploy.py", "server/setup_nginx.py", "google-services.json",
            "app/google-services.json", "app/src/main/assets", "build outputs",
        ],
        "remote_comparison": "not_performed",
    }
    (destination / "manifest.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    report = create_baseline(ROOT, args.output)
    print(json.dumps({"files": len(report["files"]),
                      "excluded_for_review": report["excluded_for_review"],
                      "output": str(args.output)}, ensure_ascii=False))
