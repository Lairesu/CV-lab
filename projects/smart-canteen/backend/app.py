import sqlite3
from database import create_zone
from typing import Literal
from pydantic import BaseModel, Field, model_validator
from fastapi import HTTPException
from database import update_table_status
from contextlib import asynccontextmanager
from database import initialize_database, read_tables, read_zones
from database import delete_zone
from fastapi import FastAPI
from database import (
    save_vision_observation,
    read_vision_observations,
)

@asynccontextmanager
async def lifespan(app: FastAPI):
    initialize_database()
    yield


app = FastAPI(
    title="Smart Canteen API",
    lifespan=lifespan
)

# When someone sends an HTTP GET request to /health, execute the health() function.
@app.get("/health")
def health():
    return {
        "status": "ok",
        "service": "smart-canteen-api"
    }


@app.get("/api/tables")
def get_tables():
    return {
        "venue_id": "demo-cafe",
        "data_source": "static_demo",
        "tables": [
            {
                "id": "T-01",
                "label": "Table 01",
                "area": "Terrace",
                "seats": 4,
                "status": "unknown"
            },
            {
                "id": "T-02",
                "label": "Table 02",
                "area": "Terrace",
                "seats": 4,
                "status": "unknown"
            },
            {
                "id": "T-03",
                "label": "Table 03",
                "area": "Terrace",
                "seats": 4,
                "status": "unknown"
            },
            {
                "id": "T-04",
                "label": "Table 04",
                "area": "Terrace",
                "seats": 4,
                "status": "unknown"
            }
        ]
    }

@app.get("/api/db/tables")
def get_database_tables():
    return {
        "data_source": "sqlite_demo",
        "tables": read_tables()
    }

@app.get("/api/db/zones")
def get_database_zones():
    # Keep SQL in database.py so this endpoint only handles the API response.
    return {
        "data_source": "sqlite",
        "zones": read_zones()
    }

class StatusUpdate(BaseModel):
    status: Literal["available", "occupied", "unknown"]


class ZoneCreate(BaseModel):
    # These identify the existing physical table and camera view.
    table_id: str = Field(min_length=1)
    camera_id: str = Field(min_length=1)

    # Normalized coordinates must stay within the image.
    x: float = Field(ge=0, le=1)
    y: float = Field(ge=0, le=1)
    width: float = Field(gt=0, le=1)
    height: float = Field(gt=0, le=1)

    @model_validator(mode="after")
    def check_rectangle_bounds(self):
        # The rectangle must not extend beyond the image edges.
        if self.x + self.width > 1.000001:
            raise ValueError("Zone extends beyond the right edge")

        if self.y + self.height > 1.000001:
            raise ValueError("Zone extends beyond the bottom edge")

        return self

@app.patch("/api/db/tables/{table_id}/status")
def change_table_status(table_id: str, payload: StatusUpdate):
    updated = update_table_status(table_id, payload.status)

    if not updated:
        raise HTTPException(
            status_code=404,
            detail="Table not found"
        )

    return {
        "id": table_id,
        "status": payload.status,
        "source": "manual_demo"
    }


@app.post("/api/db/zones", status_code=201)
def add_database_zone(payload: ZoneCreate):
    try:
        # Pydantic has already checked the rectangle coordinates.
        # Now ask SQLite to save it and generate a zone ID.
        zone_id = create_zone(
            payload.table_id,
            payload.camera_id,
            payload.x,
            payload.y,
            payload.width,
            payload.height
        )

    except sqlite3.IntegrityError:
        # Reject missing physical tables or violated database constraints.
        raise HTTPException(
            status_code=400,
            detail="Invalid zone or table_id"
        ) from None

    # Return the assigned ID alongside the saved zone information.
    return {
        "id": zone_id,
        **payload.model_dump()
    }


@app.delete("/api/db/zones/{zone_id}")
def remove_database_zone(zone_id: int):
    # Delete only the selected camera zone, not its physical table.
    deleted = delete_zone(zone_id)

    # Tell the client if that zone ID does not exist.
    if not deleted:
        raise HTTPException(
            status_code=404,
            detail="Zone not found"
        )

    # Confirm which zone was successfully deleted.
    return {
        "id": zone_id,
        "deleted": True
    }


# Session 06: computer-vision observation API.
# Observations are separate from manual table statuses.

class VisionObservationCreate(BaseModel):
    camera_id: str = Field(min_length=1, max_length=64)
    table_id: str = Field(min_length=1, max_length=64)

    observation: Literal[
        "person_detected",
        "no_person_detected",
        "unknown"
    ]

    people_detected: int = Field(ge=0)

    @model_validator(mode="after")
    def check_detection_count(self):
        if self.observation == "person_detected":
            if self.people_detected == 0:
                raise ValueError(
                    "person_detected requires at least one person"
                )
        elif self.people_detected != 0:
            raise ValueError(
                "Other observations must have zero people"
            )

        return self


@app.get("/api/db/vision-observations")
def get_vision_observations():
    return {
        "data_source": "sqlite",
        "observations": read_vision_observations()
    }


@app.post("/internal/vision/observations", status_code=201)
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
            detail="No zone configured for this camera and table"
        )

    return {
        "camera_id": payload.camera_id,
        "table_id": payload.table_id,
        "observation": payload.observation,
        "people_detected": payload.people_detected,
        "saved": True
    }
