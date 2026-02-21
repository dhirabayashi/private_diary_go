package db

import (
	"database/sql"
	"fmt"

	_ "modernc.org/sqlite"
)

// Open opens (or creates) the SQLite database at path and runs migrations.
// foreign_keys is enabled via DSN so it applies to every new connection.
func Open(path string) (*sql.DB, error) {
	dsn := "file:" + path + "?_pragma=foreign_keys(ON)"
	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, fmt.Errorf("open db: %w", err)
	}
	// SQLite supports only one writer at a time.
	db.SetMaxOpenConns(1)

	if err := migrate(db); err != nil {
		db.Close()
		return nil, fmt.Errorf("migrate: %w", err)
	}
	return db, nil
}

func migrate(db *sql.DB) error {
	stmts := []string{
		`PRAGMA journal_mode=WAL`,
		`CREATE TABLE IF NOT EXISTS entries (
			id         INTEGER PRIMARY KEY AUTOINCREMENT,
			entry_date TEXT    NOT NULL UNIQUE,
			body       TEXT    NOT NULL DEFAULT '',
			created_at TEXT    NOT NULL,
			updated_at TEXT    NOT NULL
		)`,
		`CREATE TABLE IF NOT EXISTS images (
			id            INTEGER PRIMARY KEY AUTOINCREMENT,
			entry_id      INTEGER NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
			filename      TEXT    NOT NULL,
			original_name TEXT    NOT NULL,
			sort_order    INTEGER NOT NULL DEFAULT 0,
			created_at    TEXT    NOT NULL
		)`,
	}
	for _, stmt := range stmts {
		if _, err := db.Exec(stmt); err != nil {
			return fmt.Errorf("exec %q: %w", stmt[:min(len(stmt), 40)], err)
		}
	}
	return nil
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
