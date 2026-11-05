import sqlite3
from contextlib import closing

DB_PATH = "/data/smart-canteen.db"

# How long a camera "person_detected" result counts as current.
FRESHNESS_SECONDS = 120

DEMO_TABLES = [
    ("T-01", "demo-cafe", "Table 01", "Terrace", 4),
    ("T-02", "demo-cafe", "Table 02", "Terrace", 4),
    ("T-03", "demo-cafe", "Table 03", "Terrace", 4),
    ("T-04", "demo-cafe", "Table 04", "Terrace", 4),
]


def connect():
    return closing(sqlite3.connect(DB_PATH))


def initialize_database():
    with connect() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS tables (
                id TEXT PRIMARY KEY,
                venue_id TEXT NOT NULL,
                label TEXT NOT NULL,
                area TEXT NOT NULL,
                seats INTEGER NOT NULL CHECK(seats > 0),
                status TEXT NOT NULL DEFAULT 'unknown'
                    CHECK(status IN ('available', 'occupied', 'unknown'))
            )
        """)

        # Migration for databases created before status modes existed.
        columns = {row[1] for row in conn.execute("PRAGMA table_info(tables)")}
        if "status_mode" not in columns:
            conn.execute("""
                ALTER TABLE tables
                ADD COLUMN status_mode TEXT NOT NULL DEFAULT 'manual'
                CHECK(status_mode IN ('manual', 'automatic'))
            """)

        conn.execute("""
            CREATE TABLE IF NOT EXISTS table_zones (
                id INTEGER PRIMARY KEY,
                table_id TEXT NOT NULL REFERENCES tables(id),
                camera_id TEXT NOT NULL,
                x REAL NOT NULL,
                y REAL NOT NULL,
                width REAL NOT NULL CHECK(width > 0),
                height REAL NOT NULL CHECK(height > 0),
                CHECK (
                    x >= 0 AND y >= 0
                    AND x + width <= 1.000001
                    AND y + height <= 1.000001
                )
            )
        """)

        # Latest camera result per camera/table, kept apart from the manual status.
        conn.execute("""
            CREATE TABLE IF NOT EXISTS vision_observations (
                camera_id TEXT NOT NULL,
                table_id TEXT NOT NULL REFERENCES tables(id),
                observation TEXT NOT NULL
                    CHECK(observation IN (
                        'person_detected', 'no_person_detected', 'unknown'
                    )),
                people_detected INTEGER NOT NULL DEFAULT 0
                    CHECK(people_detected >= 0),
                source TEXT NOT NULL DEFAULT 'recorded_video_demo',
                observed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (camera_id, table_id)
            )
        """)

        conn.executemany("""
            INSERT OR IGNORE INTO tables (id, venue_id, label, area, seats)
            VALUES (?, ?, ?, ?, ?)
        """, DEMO_TABLES)
        conn.commit()


def read_tables():
    # Effective status: manual tables show the saved status. Automatic tables
    # show "occupied" only for a recent person detection in a configured zone,
    # otherwise "unknown". The camera never produces "available".
    with connect() as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute(f"""
            SELECT
                t.id,
                t.venue_id,
                t.label,
                t.area,
                t.seats,
                t.status AS manual_status,
                t.status_mode,
                CASE
                    WHEN t.status_mode = 'manual' THEN t.status
                    WHEN EXISTS (
                        SELECT 1
                        FROM vision_observations v
                        JOIN table_zones z
                          ON z.table_id = v.table_id
                         AND z.camera_id = v.camera_id
                        WHERE v.table_id = t.id
                          AND v.observation = 'person_detected'
                          AND v.observed_at >= datetime('now', '-{FRESHNESS_SECONDS} seconds')
                    ) THEN 'occupied'
                    ELSE 'unknown'
                END AS status
            FROM tables t
            ORDER BY t.label
        """).fetchall()
        return [dict(row) for row in rows]


def create_table(label: str, seats: int, area: str = "Canteen") -> dict:
    with connect() as conn:
        ids = [row[0] for row in conn.execute("SELECT id FROM tables WHERE id LIKE 'T-%'")]
        numbers = [int(i[2:]) for i in ids if i[2:].isdigit()]
        number = max(numbers, default=0) + 1
        table_id = f"T-{number:02d}"
        label = label.strip() or f"Table {number:02d}"

        conn.execute("""
            INSERT INTO tables (id, venue_id, label, area, seats)
            VALUES (?, 'demo-cafe', ?, ?, ?)
        """, (table_id, label, area, seats))
        conn.commit()
        return {"id": table_id, "label": label, "area": area, "seats": seats}


def update_table_status(table_id: str, new_status: str) -> bool:
    with connect() as conn:
        cursor = conn.execute(
            "UPDATE tables SET status = ? WHERE id = ?",
            (new_status, table_id),
        )
        conn.commit()
        return cursor.rowcount == 1


def update_table_mode(table_id: str, new_mode: str) -> bool:
    if new_mode not in ("manual", "automatic"):
        return False
    with connect() as conn:
        cursor = conn.execute(
            "UPDATE tables SET status_mode = ? WHERE id = ?",
            (new_mode, table_id),
        )
        conn.commit()
        return cursor.rowcount == 1


def read_zones():
    with connect() as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute("""
            SELECT z.id, z.table_id, t.label AS label, z.camera_id,
                   z.x, z.y, z.width, z.height
            FROM table_zones AS z
            JOIN tables AS t ON z.table_id = t.id
            ORDER BY z.id
        """).fetchall()
        return [dict(row) for row in rows]


def create_zone(table_id, camera_id, x, y, width, height):
    with connect() as conn:
        conn.execute("PRAGMA foreign_keys = ON")
        cursor = conn.execute("""
            INSERT INTO table_zones (table_id, camera_id, x, y, width, height)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (table_id, camera_id, x, y, width, height))
        conn.commit()
        return cursor.lastrowid


def delete_zone(zone_id: int) -> bool:
    with connect() as conn:
        cursor = conn.execute("DELETE FROM table_zones WHERE id = ?", (zone_id,))
        conn.commit()
        return cursor.rowcount == 1


def save_vision_observation(camera_id, table_id, observation, people_detected):
    with connect() as conn:
        has_zone = conn.execute("""
            SELECT 1 FROM table_zones
            WHERE camera_id = ? AND table_id = ?
            LIMIT 1
        """, (camera_id, table_id)).fetchone()
        if has_zone is None:
            return False

        conn.execute("""
            INSERT INTO vision_observations
                (camera_id, table_id, observation, people_detected)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(camera_id, table_id) DO UPDATE SET
                observation = excluded.observation,
                people_detected = excluded.people_detected,
                observed_at = CURRENT_TIMESTAMP
        """, (camera_id, table_id, observation, people_detected))
        conn.commit()
        return True


def read_vision_observations():
    with connect() as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute("""
            SELECT camera_id, table_id, observation, people_detected,
                   source, observed_at
            FROM vision_observations
            ORDER BY camera_id, table_id
        """).fetchall()
        return [dict(row) for row in rows]
