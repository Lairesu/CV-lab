
import sqlite3
from contextlib import closing

DB_PATH = "/data/smart-canteen.db"


def initialize_database():
    with closing(sqlite3.connect(DB_PATH)) as conn:
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
