
import sqlite3
from contextlib import closing

DB_PATH = "/data/smart-canteen.db"


def initialize_database():
    with closing(sqlite3.connect(DB_PATH)) as conn:
        # Existing physical tables.
        conn.execute("""
            CREATE TABLE IF NOT EXISTS tables (
                id TEXT PRIMARY KEY,
                venue_id TEXT NOT NULL,
                label TEXT NOT NULL,
                area TEXT NOT NULL,
                seats INTEGER NOT NULL CHECK(seats > 0),
                status TEXT NOT NULL DEFAULT 'unknown'
                    CHECK(status IN (
                        'available', 'occupied', 'unknown'
                    ))
            )
        """)

        # Session 04: camera zones associated with physical tables.
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

        # Session 06: latest computer-vision observation for each
        # physical table as seen by a particular camera.
        # Separate from the administrator's manual status.
        conn.execute("""
            CREATE TABLE IF NOT EXISTS vision_observations (
                camera_id TEXT NOT NULL,
                table_id TEXT NOT NULL REFERENCES tables(id),

                observation TEXT NOT NULL
                    CHECK(observation IN (
                        'person_detected',
                        'no_person_detected',
                        'unknown'
                    )),

                people_detected INTEGER NOT NULL DEFAULT 0
                    CHECK(people_detected >= 0),

                source TEXT NOT NULL DEFAULT 'recorded_video_demo',
                observed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

                PRIMARY KEY (camera_id, table_id)
            )
        """)


        # Initial demonstration records only.
        demo_tables = [
            ("T-01", "demo-cafe", "Table 01", "Terrace", 4),
            ("T-02", "demo-cafe", "Table 02", "Terrace", 4),
            ("T-03", "demo-cafe", "Table 03", "Terrace", 4),
            ("T-04", "demo-cafe", "Table 04", "Terrace", 4),
        ]

        conn.executemany("""
            INSERT OR IGNORE INTO tables
                (id, venue_id, label, area, seats)
            VALUES (?, ?, ?, ?, ?)
        """, demo_tables)

        conn.commit()


def read_tables():
    with closing(sqlite3.connect(DB_PATH)) as conn:
        conn.row_factory = sqlite3.Row

        rows = conn.execute("""
            SELECT id, venue_id, label, area, seats, status
            FROM tables
            ORDER BY label
        """).fetchall()

        return [dict(row) for row in rows]


def update_table_status(table_id: str, new_status: str) -> bool:
    with closing(sqlite3.connect(DB_PATH)) as conn:
        cursor = conn.execute(
            "UPDATE tables SET status = ? WHERE id = ?",
            (new_status, table_id)
        )

        conn.commit()

        return cursor.rowcount == 1

def read_zones():
    # Open SQLite to retrieve zones and their physical table labels.
    with closing(sqlite3.connect(DB_PATH)) as conn:
        conn.row_factory = sqlite3.Row

        # JOIN connects each camera zone to its physical table.
        # We use the existing label instead of storing a duplicate.
        rows = conn.execute("""
            SELECT
                z.id,
                z.table_id,
                t.label AS label,
                z.camera_id,
                z.x,
                z.y,
                z.width,
                z.height
            FROM table_zones AS z
            JOIN tables AS t ON z.table_id = t.id
            ORDER BY z.id
        """).fetchall()

        return [dict(row) for row in rows]

def create_zone(table_id, camera_id, x, y, width, height):
    # Open our SQLite database.
    with closing(sqlite3.connect(DB_PATH)) as conn:

        # Reject zones assigned to physical tables that don't exist.
        conn.execute("PRAGMA foreign_keys = ON")

        # Use SQL placeholders to safely insert the provided values.
        cursor = conn.execute("""
            INSERT INTO table_zones
                (table_id, camera_id, x, y, width, height)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (table_id, camera_id, x, y, width, height))

        # Commit because INSERT modifies the database.
        conn.commit()

        # Return the unique ID assigned to the new zone.
        return cursor.lastrowid


def delete_zone(zone_id: int) -> bool:
    # Delete only this camera zone, not its physical table.
    with closing(sqlite3.connect(DB_PATH)) as conn:

        # The placeholder safely passes the requested zone ID.
        cursor = conn.execute(
            "DELETE FROM table_zones WHERE id = ?",
            (zone_id,)
        )

        # Make the deletion permanent.
        conn.commit()

        # True means a matching zone existed and was deleted.
        return cursor.rowcount == 1



def save_vision_observation(
    camera_id, table_id, observation, people_detected
):
    """Save the latest observation without changing manual status."""

    with closing(sqlite3.connect(DB_PATH)) as conn:

        # Only accept a table configured for this camera.
        existing_zone = conn.execute("""
            SELECT 1 FROM table_zones
            WHERE camera_id = ? AND table_id = ?
            LIMIT 1
        """, (camera_id, table_id)).fetchone()

        if existing_zone is None:
            return False

        conn.execute("""
            INSERT INTO vision_observations
                (camera_id, table_id, observation, people_detected)
            VALUES (?, ?, ?, ?)

            ON CONFLICT(camera_id, table_id)
            DO UPDATE SET
                observation = excluded.observation,
                people_detected = excluded.people_detected,
                observed_at = CURRENT_TIMESTAMP
        """, (
            camera_id, table_id, observation, people_detected
        ))

        conn.commit()
        return True


def read_vision_observations():
    """Return the most recent observation for each camera/table."""

    with closing(sqlite3.connect(DB_PATH)) as conn:
        conn.row_factory = sqlite3.Row

        rows = conn.execute("""
            SELECT
                camera_id,
                table_id,
                observation,
                people_detected,
                source,
                observed_at
            FROM vision_observations
            ORDER BY camera_id, table_id
        """).fetchall()

        return [dict(row) for row in rows]
