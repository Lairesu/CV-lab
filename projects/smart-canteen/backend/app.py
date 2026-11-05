import hmac
import json
import os
import sqlite3
import tempfile
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Literal
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from fastapi import Depends, FastAPI, File, Header, HTTPException, UploadFile
from pydantic import BaseModel, Field, model_validator

from database import (
    create_table,
    create_zone,
    delete_zone,
    initialize_database,
    read_tables,
    read_vision_observations,
    read_zones,
    save_vision_observation,
    update_table_mode,
    update_table_status,
)

MEDIA_DIR = Path("/media")
MAX_UPLOAD_BYTES = 50 * 1024 * 1024
MEDIA_TYPES = {"CAM-01": ".png", "CAM-02": ".mp4"}
WORKER_START_URL = "http://vision:8098/internal/start"


@asynccontextmanager
async def lifespan(app: FastAPI):
    initialize_database()
    yield


app = FastAPI(title="Smart Canteen API", lifespan=lifespan)


def key_matches(supplied: str | None, env_name: str) -> bool:
    expected = os.environ.get(env_name, "")
    if not expected or not supplied:
        return False
    return hmac.compare_digest(supplied.encode(), expected.encode())


def require_admin(x_admin_key: str | None = Header(default=None)):
    if not key_matches(x_admin_key, "SMART_CANTEEN_ADMIN_KEY"):
        raise HTTPException(status_code=401, detail="Unauthorized")


def require_worker(x_worker_key: str | None = Header(default=None)):
    if not key_matches(x_worker_key, "SMART_CANTEEN_WORKER_KEY"):
        raise HTTPException(status_code=401, detail="Unauthorized")


class StatusUpdate(BaseModel):
    status: Literal["available", "occupied", "unknown"]


class TableModeUpdate(BaseModel):
    mode: Literal["manual", "automatic"]


class TableCreate(BaseModel):
    label: str = Field(default="", max_length=40)
    seats: int = Field(ge=1, le=20)


class ZoneCreate(BaseModel):
    table_id: str = Field(min_length=1)
    camera_id: str = Field(min_length=1)

    # Normalized coordinates: 0..1 of the image width and height.
    x: float = Field(ge=0, le=1)
    y: float = Field(ge=0, le=1)
    width: float = Field(gt=0, le=1)
    height: float = Field(gt=0, le=1)

    @model_validator(mode="after")
    def check_rectangle_bounds(self):
        if self.x + self.width > 1.000001:
            raise ValueError("Zone extends beyond the right edge")
        if self.y + self.height > 1.000001:
            raise ValueError("Zone extends beyond the bottom edge")
        return self


class VisionObservationCreate(BaseModel):
    camera_id: str = Field(min_length=1, max_length=64)
    table_id: str = Field(min_length=1, max_length=64)
    observation: Literal["person_detected", "no_person_detected", "unknown"]
    people_detected: int = Field(ge=0)

    @model_validator(mode="after")
    def check_detection_count(self):
        if self.observation == "person_detected" and self.people_detected == 0:
            raise ValueError("person_detected requires at least one person")
        if self.observation != "person_detected" and self.people_detected != 0:
            raise ValueError("Other observations must have zero people")
        return self


@app.get("/health")
def health():
    return {"status": "ok", "service": "smart-canteen-api"}


@app.get("/api/db/tables")
def get_tables():
    return {"data_source": "sqlite_demo", "tables": read_tables()}


@app.get("/api/db/zones")
def get_zones():
    return {"data_source": "sqlite", "zones": read_zones()}


@app.get("/api/db/vision-observations")
def get_vision_observations():
    return {"data_source": "sqlite", "observations": read_vision_observations()}


@app.patch("/api/db/tables/{table_id}/status", dependencies=[Depends(require_admin)])
def change_table_status(table_id: str, payload: StatusUpdate):
    if not update_table_status(table_id, payload.status):
        raise HTTPException(status_code=404, detail="Table not found")
    return {"id": table_id, "status": payload.status, "source": "manual_demo"}


@app.post("/api/admin/tables", status_code=201, dependencies=[Depends(require_admin)])
def add_table(payload: TableCreate):
    return create_table(payload.label, payload.seats)


@app.patch("/api/admin/tables/{table_id}/mode", dependencies=[Depends(require_admin)])
def change_table_mode(table_id: str, payload: TableModeUpdate):
    if not update_table_mode(table_id, payload.mode):
        raise HTTPException(status_code=404, detail="Table not found")
    return {"table_id": table_id, "status_mode": payload.mode, "updated": True}


@app.post("/api/db/zones", status_code=201, dependencies=[Depends(require_admin)])
def add_zone(payload: ZoneCreate):
    try:
        zone_id = create_zone(
            payload.table_id,
            payload.camera_id,
            payload.x,
            payload.y,
            payload.width,
            payload.height,
        )
    except sqlite3.IntegrityError:
        raise HTTPException(status_code=400, detail="Invalid zone or table_id") from None
    return {"id": zone_id, **payload.model_dump()}


@app.delete("/api/db/zones/{zone_id}", dependencies=[Depends(require_admin)])
def remove_zone(zone_id: int):
    # Removes only the camera zone; the physical table stays.
    if not delete_zone(zone_id):
        raise HTTPException(status_code=404, detail="Zone not found")
    return {"id": zone_id, "deleted": True}


@app.post(
    "/internal/vision/observations",
    status_code=201,
    dependencies=[Depends(require_worker)],
)
def create_vision_observation(payload: VisionObservationCreate):
    saved = save_vision_observation(
        payload.camera_id,
        payload.table_id,
        payload.observation,
        payload.people_detected,
    )
    if not saved:
        raise HTTPException(
            status_code=404,
            detail="No zone configured for this camera and table",
        )
    return {**payload.model_dump(), "saved": True}


@app.post("/api/admin/media/{camera_id}", dependencies=[Depends(require_admin)])
async def upload_camera_media(camera_id: str, file: UploadFile = File(...)):
    if camera_id not in MEDIA_TYPES:
        raise HTTPException(status_code=400, detail="Unknown camera")

    suffix = MEDIA_TYPES[camera_id]
    first_bytes = await file.read(16)

    # Check the file signature, not just the filename.
    valid_png = first_bytes.startswith(b"\x89PNG\r\n\x1a\n")
    valid_mp4 = first_bytes[4:8] == b"ftyp"
    if (suffix == ".png" and not valid_png) or (suffix == ".mp4" and not valid_mp4):
        await file.close()
        raise HTTPException(status_code=400, detail="Invalid file type")

    temp_path = None
    try:
        # Write to a temporary file so a failed upload never replaces the old media.
        with tempfile.NamedTemporaryFile(
            mode="wb", dir=MEDIA_DIR, prefix="upload-", delete=False
        ) as output:
            temp_path = Path(output.name)
            total = 0
            chunk = first_bytes
            while chunk:
                total += len(chunk)
                if total > MAX_UPLOAD_BYTES:
                    raise HTTPException(status_code=413, detail="File exceeds 50 MB limit")
                output.write(chunk)
                chunk = await file.read(1024 * 1024)

        destination = MEDIA_DIR / f"{camera_id.lower()}{suffix}"
        os.chmod(temp_path, 0o644)  # readable by the vision container
        os.replace(temp_path, destination)

        return {
            "message": "Upload successful",
            "camera_id": camera_id,
            "filename": destination.name,
            "size_bytes": total,
        }
    finally:
        await file.close()
        if temp_path is not None:
            temp_path.unlink(missing_ok=True)


@app.post(
    "/api/admin/analysis/start",
    status_code=202,
    dependencies=[Depends(require_admin)],
)
def start_video_analysis():
    worker_key = os.environ.get("SMART_CANTEEN_WORKER_KEY", "")
    if not worker_key:
        raise HTTPException(status_code=503, detail="Worker not configured")

    request = Request(
        WORKER_START_URL,
        data=b"",
        headers={"X-Worker-Key": worker_key},
        method="POST",
    )
    try:
        with urlopen(request, timeout=5) as response:
            return json.load(response)
    except HTTPError as error:
        if error.code == 409:
            raise HTTPException(status_code=409, detail="Analysis already running") from None
        raise HTTPException(status_code=502, detail="Worker rejected request") from None
    except (URLError, TimeoutError):
        raise HTTPException(status_code=503, detail="YOLO worker unavailable") from None
