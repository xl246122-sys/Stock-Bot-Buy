"""Build an isolated offline sector-test APK without packaging provider credentials."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


def main():
    from server.v2.sector_api import status

    os.chdir(ROOT)
    subprocess.run(["npm.cmd", "run", "lint"], check=True)
    subprocess.run(["npx.cmd", "vite", "build", "--config", "vite.radar.config.ts"], check=True)
    assets = ROOT / ".local/radar-assets/dist"
    shutil.copyfile(assets / "radar-test.html", assets / "index.html")
    snapshot = status()
    assert snapshot["watchlist"]["selected_count"] == 80
    assert len(snapshot["us_etf_trends"]) == 8
    assert snapshot["buy_enabled"] is False
    (assets / "sector-snapshot.json").write_text(
        json.dumps(snapshot, ensure_ascii=False), encoding="utf-8"
    )
    subprocess.run([
        str(ROOT / "gradlew.bat"), ":app:assembleRadarTest",
        "-PradarAssets=.local/radar-assets", "--offline",
    ], check=True)


if __name__ == "__main__":
    main()
