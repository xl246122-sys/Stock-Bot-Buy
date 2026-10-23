"""Local radar preview. Does not import legacy scanners, account routes or FCM."""
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from .sector_api import router
from .control_api import router as control_router

app = FastAPI(title="Stock-G sector preview")
app.include_router(router)
app.include_router(control_router)
dist = Path(__file__).resolve().parents[2] / "dist"
if dist.is_dir():
    app.mount("/", StaticFiles(directory=dist, html=True), name="radar-preview")
