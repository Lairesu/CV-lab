# Smart Canteen — Session 02 starter

This is a **static sample-data-only dashboard**. It has **no backend, camera, YOLO inference, or live occupancy status**.

## Prerequisites
- Your existing `/srv/data/syncthing/Github/CV-lab` directory
- An existing `docker-compose.yml` with the `vision` service (unchanged)
- Docker Compose on the Debian host

## 1. Read-only verification, on the Debian host

```bash
cd /srv/data/syncthing/Github/CV-lab
pwd
ls -la
docker compose config --services
docker compose ps
ls -la projects/smart-canteen 2>/dev/null || echo "New app directory"
```

Expected: the `vision` service exists. Stop if existing files conflict with this starter; do not overwrite them blindly.

## 2. Unpack the starter

Download this ZIP to your Debian host (for example into `~/Downloads`).

From `/srv/data/syncthing/Github/CV-lab`, check the archive first:

```bash
unzip -l ~/Downloads/smart-canteen-session02-starter.zip
```

If all destinations are new, extract:

```bash
unzip -n ~/Downloads/smart-canteen-session02-starter.zip -d .
```

`-n` will **not overwrite existing files**. Review if any files were skipped.

## 3. Validate the combined Compose configuration

```bash
docker compose -f docker-compose.yml -f docker-compose.dashboard.yml config --services
docker compose -f docker-compose.yml -f docker-compose.dashboard.yml config --quiet
```

Expected: `vision` and `dashboard` exist and config is valid. Both Compose files use the same project directory and Docker will merge the service definitions.

## 4. Start ONLY the dashboard service

```bash
docker compose -f docker-compose.yml -f docker-compose.dashboard.yml up -d --no-deps dashboard
docker compose -f docker-compose.yml -f docker-compose.dashboard.yml ps dashboard
curl -I http://127.0.0.1:8099/
```

Expected: HTTP 200; site opens at `http://localhost:8099/` **on the Debian homelab itself**.

`127.0.0.1` is intentional: the dashboard is only locally exposed while being developed. We can later publish it safely to other devices or via Tailscale after testing.

## 5. Run acceptance checks

- Banner says **DEMO MODE · SAMPLE DATA ONLY**.
- All six tables display; three Available, two Occupied, one Unknown.
- Status filters work without page reload.
- Site is usable at mobile viewport width.
- No camera or real availability claims are displayed.
- Existing `vision` container has not been modified.

## Layout and extensibility

```text
CV-lab/
├── docker-compose.yml                 # existing, not touched
├── docker-compose.dashboard.yml       # new service, separate file
├── models/                            # existing YOLO models
└── projects/
    └── smart-canteen/
        └── frontend/
            ├── index.html
            ├── styles.css
            ├── sample-data.js        # venue-specific config + mock tables
            └── app.js                # reusable rendering/filter logic
```

Venue metadata and table statuses intentionally live in `sample-data.js`, not hard-coded into UI components. This supports future café, restaurant and shared-space use cases, though the MVP remains a canteen demo.

## Stop only the dashboard

```bash
docker compose -f docker-compose.yml -f docker-compose.dashboard.yml stop dashboard
```

## Next session milestones

- Browser-based administrator table-zone editor (normalized coordinates)
- Backend API for real occupancy snapshots
- Computer vision temporal logic with Unknown state
- Replay of authorized prerecorded video; later permitted fixed-camera input
- Privacy/legal review before real-world installation
