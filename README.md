# Smart Canteen

A university case-competition prototype that shows students which canteen tables are **Available**, **Occupied** or **Unknown**.

- **Manual mode:** staff set a table's status.
- **Automatic mode:** YOLO looks for people inside each table's zone on a recorded video. A person seen in the last 2 minutes shows **Occupied** (a camera estimate), otherwise **Unknown**. The camera never marks a table Available.

## Services

| Service | Compose file | Role | Host port |
|---|---|---|---|
| `dashboard` | `docker-compose.dashboard.yml` | Nginx: serves the frontend, proxies `/api/` | `127.0.0.1:8099` |
| `api` | `docker-compose.api.yml` | FastAPI + SQLite (named volume) | `127.0.0.1:8100` |
| `vision` | `docker-compose.yml` | YOLO worker that analyses `media/cam-02.mp4` | `127.0.0.1:8098` |

```text
projects/
├── canteen-vision/        YOLO worker, zone matching, publishers
└── smart-canteen/
    ├── backend/           app.py (routes), database.py (SQLite)
    ├── frontend/          index.html (students), admin.html (staff)
    ├── nginx/             default.conf
    └── media/             cam-02.mp4 (uploaded from the admin page)
```

## Configuration

Create `.env` next to the Compose files (never commit it):

```text
SMART_CANTEEN_ADMIN_KEY=<long random string>
SMART_CANTEEN_WORKER_KEY=<different long random string>
LOCAL_UID=<your uid>
LOCAL_GID=<your gid>
VIDEO_GID=<gid of /dev/video0>
```

## Run

```bash
docker compose -f docker-compose.yml -f docker-compose.dashboard.yml -f docker-compose.api.yml up -d --build
```

- Student page: `http://127.0.0.1:8099/`
- Admin page: `http://127.0.0.1:8099/admin.html`
- API health: `http://127.0.0.1:8100/health`

## API

| Route | Access |
|---|---|
| `GET /api/db/tables` · `/api/db/zones` · `/api/db/vision-observations` | Public read |
| `PATCH /api/db/tables/{id}/status` | Admin key |
| `PATCH /api/admin/tables/{id}/mode` | Admin key |
| `POST /api/db/zones` · `DELETE /api/db/zones/{id}` | Admin key |
| `POST /api/admin/media/CAM-02` · `POST /api/admin/analysis/start` | Admin key |
| `POST /internal/vision/observations` | Worker key |

Admin requests send the `X-Admin-Key` header; the worker sends `X-Worker-Key`.

## Limits

Prototype only: recorded video instead of a live camera, no measured accuracy, one shared admin key, and no production hosting or privacy review.
