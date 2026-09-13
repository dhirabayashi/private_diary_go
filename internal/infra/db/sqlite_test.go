package db_test

import (
	"database/sql"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"private_diary/internal/infra/db"

	_ "modernc.org/sqlite"
)

func TestOpen_NewDB_HasVersionColumn(t *testing.T) {
	path := filepath.Join(t.TempDir(), "diary.db")

	sqlDB, err := db.Open(path)
	require.NoError(t, err)
	defer sqlDB.Close()

	var count int
	require.NoError(t, sqlDB.QueryRow(
		`SELECT COUNT(*) FROM pragma_table_info('entries') WHERE name = 'version'`,
	).Scan(&count))
	assert.Equal(t, 1, count)
}

func TestOpen_ExistingDBWithoutVersionColumn_GetsMigrated(t *testing.T) {
	path := filepath.Join(t.TempDir(), "diary.db")

	// version列を持たない旧スキーマのDBを事前に作成しておく。
	preExisting, err := sql.Open("sqlite", "file:"+path)
	require.NoError(t, err)
	_, err = preExisting.Exec(`CREATE TABLE entries (
		id         INTEGER PRIMARY KEY AUTOINCREMENT,
		entry_date TEXT    NOT NULL UNIQUE,
		body       TEXT    NOT NULL DEFAULT '',
		created_at TEXT    NOT NULL,
		updated_at TEXT    NOT NULL
	)`)
	require.NoError(t, err)
	_, err = preExisting.Exec(
		`INSERT INTO entries (entry_date, body, created_at, updated_at) VALUES (?, ?, ?, ?)`,
		"2024-01-01", "旧データ", "2024-01-01T00:00:00Z", "2024-01-01T00:00:00Z",
	)
	require.NoError(t, err)
	require.NoError(t, preExisting.Close())

	sqlDB, err := db.Open(path)
	require.NoError(t, err)
	defer sqlDB.Close()

	var version int
	require.NoError(t, sqlDB.QueryRow(
		`SELECT version FROM entries WHERE entry_date = ?`, "2024-01-01",
	).Scan(&version))
	assert.Equal(t, 1, version, "既存行はデフォルト値1で移行されること")
}

func TestOpen_Idempotent(t *testing.T) {
	path := filepath.Join(t.TempDir(), "diary.db")

	sqlDB1, err := db.Open(path)
	require.NoError(t, err)
	require.NoError(t, sqlDB1.Close())

	sqlDB2, err := db.Open(path)
	require.NoError(t, err, "2回目のOpen（再起動相当）でマイグレーションが再実行されてもエラーにならないこと")
	require.NoError(t, sqlDB2.Close())
}
