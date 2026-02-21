package sqlite_test

import (
	"database/sql"
	"testing"

	"github.com/stretchr/testify/require"

	_ "modernc.org/sqlite"
)

// newTestDB opens an in-memory SQLite DB with schema applied.
func newTestDB(t *testing.T) *sql.DB {
	t.Helper()
	db, err := sql.Open("sqlite", ":memory:")
	require.NoError(t, err)
	db.SetMaxOpenConns(1)

	stmts := []string{
		`PRAGMA foreign_keys = ON`,
		`CREATE TABLE entries (
			id         INTEGER PRIMARY KEY AUTOINCREMENT,
			entry_date TEXT    NOT NULL UNIQUE,
			body       TEXT    NOT NULL DEFAULT '',
			created_at TEXT    NOT NULL,
			updated_at TEXT    NOT NULL
		)`,
		`CREATE TABLE images (
			id            INTEGER PRIMARY KEY AUTOINCREMENT,
			entry_id      INTEGER NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
			filename      TEXT    NOT NULL,
			original_name TEXT    NOT NULL,
			sort_order    INTEGER NOT NULL DEFAULT 0,
			created_at    TEXT    NOT NULL
		)`,
	}
	for _, s := range stmts {
		_, err := db.Exec(s)
		require.NoError(t, err)
	}

	t.Cleanup(func() { db.Close() })
	return db
}
