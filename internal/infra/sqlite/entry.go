package sqlite

import (
	"context"
	"database/sql"
	"errors"
	"time"

	sqlitedriver "modernc.org/sqlite"

	"private_diary/internal/model"
	"private_diary/internal/repository"
)

type entryRepository struct {
	db *sql.DB
}

func NewEntryRepository(db *sql.DB) repository.EntryRepository {
	return &entryRepository{db: db}
}

func (r *entryRepository) FindByDate(ctx context.Context, date string) (*model.Entry, error) {
	row := r.db.QueryRowContext(ctx,
		`SELECT id, entry_date, body, version, created_at, updated_at FROM entries WHERE entry_date = ?`, date)
	return scanEntry(row)
}

func (r *entryRepository) List(ctx context.Context, params model.ListParams) ([]*model.Entry, int, error) {
	where, args := buildWhere(params.Query, params.From, params.To)

	var total int
	if err := r.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM entries`+where, args...).Scan(&total); err != nil {
		return nil, 0, err
	}

	offset := (params.Page - 1) * params.PageSize
	query := `SELECT id, entry_date, body, version, created_at, updated_at FROM entries` +
		where + ` ORDER BY entry_date DESC LIMIT ? OFFSET ?`
	rows, err := r.db.QueryContext(ctx, query, append(args, params.PageSize, offset)...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	entries := make([]*model.Entry, 0)
	for rows.Next() {
		e, err := scanEntryRow(rows)
		if err != nil {
			return nil, 0, err
		}
		entries = append(entries, e)
	}
	return entries, total, rows.Err()
}

func (r *entryRepository) Save(ctx context.Context, entry *model.Entry) error {
	result, err := r.db.ExecContext(ctx,
		`INSERT INTO entries (entry_date, body, version, created_at, updated_at) VALUES (?, ?, 1, ?, ?)`,
		entry.Date, entry.Body,
		entry.CreatedAt.Format(time.RFC3339),
		entry.UpdatedAt.Format(time.RFC3339),
	)
	if err != nil {
		if isUniqueConstraintErr(err) {
			return repository.ErrConflict
		}
		return err
	}
	id, err := result.LastInsertId()
	if err != nil {
		return err
	}
	entry.ID = id
	entry.Version = 1
	return nil
}

func (r *entryRepository) Update(ctx context.Context, entry *model.Entry, expectedVersion int) (bool, error) {
	result, err := r.db.ExecContext(ctx,
		`UPDATE entries SET body = ?, updated_at = ?, version = version + 1
		 WHERE entry_date = ? AND version = ?`,
		entry.Body, entry.UpdatedAt.Format(time.RFC3339), entry.Date, expectedVersion,
	)
	if err != nil {
		return false, err
	}
	n, err := result.RowsAffected()
	if err != nil {
		return false, err
	}
	return n > 0, nil
}

// isUniqueConstraintErr はerrがSQLiteのUNIQUE制約違反によるものかどうかを判定する
// （プライマリの結果コード SQLITE_CONSTRAINT = 19。拡張コードが返っていても下位バイトに
// プライマリコードが残るため、下位バイトのみで判定する）。
func isUniqueConstraintErr(err error) bool {
	var sqliteErr *sqlitedriver.Error
	return errors.As(err, &sqliteErr) && sqliteErr.Code()&0xff == 19
}

func (r *entryRepository) Delete(ctx context.Context, date string) error {
	_, err := r.db.ExecContext(ctx, `DELETE FROM entries WHERE entry_date = ?`, date)
	return err
}

func (r *entryRepository) ExistsDate(ctx context.Context, date string) (bool, error) {
	var count int
	err := r.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM entries WHERE entry_date = ?`, date).Scan(&count)
	return count > 0, err
}

func (r *entryRepository) ListForExport(ctx context.Context, from, to string) ([]*model.Entry, error) {
	where, args := buildWhere("", from, to)
	rows, err := r.db.QueryContext(ctx,
		`SELECT id, entry_date, body, version, created_at, updated_at FROM entries`+where+` ORDER BY entry_date DESC`,
		args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	entries := make([]*model.Entry, 0)
	for rows.Next() {
		e, err := scanEntryRow(rows)
		if err != nil {
			return nil, err
		}
		entries = append(entries, e)
	}
	return entries, rows.Err()
}

// buildWhere builds a WHERE clause for filtering entries.
func buildWhere(query, from, to string) (string, []interface{}) {
	where := " WHERE 1=1"
	var args []interface{}
	if query != "" {
		where += " AND body LIKE ?"
		args = append(args, "%"+query+"%")
	}
	if from != "" {
		where += " AND entry_date >= ?"
		args = append(args, from)
	}
	if to != "" {
		where += " AND entry_date <= ?"
		args = append(args, to)
	}
	return where, args
}

type rowScanner interface {
	Scan(dest ...interface{}) error
}

func scanEntry(row *sql.Row) (*model.Entry, error) {
	var e model.Entry
	var createdAt, updatedAt string
	err := row.Scan(&e.ID, &e.Date, &e.Body, &e.Version, &createdAt, &updatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if e.CreatedAt, err = time.Parse(time.RFC3339, createdAt); err != nil {
		return nil, err
	}
	if e.UpdatedAt, err = time.Parse(time.RFC3339, updatedAt); err != nil {
		return nil, err
	}
	return &e, nil
}

func scanEntryRow(rows *sql.Rows) (*model.Entry, error) {
	var e model.Entry
	var createdAt, updatedAt string
	var err error
	if err = rows.Scan(&e.ID, &e.Date, &e.Body, &e.Version, &createdAt, &updatedAt); err != nil {
		return nil, err
	}
	if e.CreatedAt, err = time.Parse(time.RFC3339, createdAt); err != nil {
		return nil, err
	}
	if e.UpdatedAt, err = time.Parse(time.RFC3339, updatedAt); err != nil {
		return nil, err
	}
	return &e, nil
}
