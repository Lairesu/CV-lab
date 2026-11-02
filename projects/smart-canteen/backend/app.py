from typing import Literal
from pydantic import BaseModel
from fastapi import HTTPException
from database import update_table_status
from contextlib import asynccontextmanager
from database import initialize_database, read_tables
from fastapi import FastAPI

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


class StatusUpdate(BaseModel):
    status: Literal["available", "occupied", "unknown"]


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
