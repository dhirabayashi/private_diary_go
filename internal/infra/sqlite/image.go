package sqlite

import (
	"context"
	"database/sql"
	"errors"
	"time"

	"private_diary/internal/model"
	"private_diary/internal/repository"
)

type imageRepository struct {
	db *sql.DB
}

func NewImageRepository(db *sql.DB) repository.ImageRepository {
	return &imageRepository{db: db}
}

func (r *imageRepository) FindByEntryID(ctx context.Context, entryID int64) ([]*model.Image, error) {
	rows, err := r.db.QueryContext(ctx,
		`SELECT id, entry_id, filename, original_name, sort_order, created_at
		 FROM images WHERE entry_id = ? ORDER BY sort_order ASC`, entryID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	images := make([]*model.Image, 0)
	for rows.Next() {
		img, err := scanImageRow(rows)
		if err != nil {
			return nil, err
		}
		images = append(images, img)
	}
	return images, rows.Err()
}

func (r *imageRepository) FindByID(ctx context.Context, id int64) (*model.Image, error) {
	row := r.db.QueryRowContext(ctx,
		`SELECT id, entry_id, filename, original_name, sort_order, created_at FROM images WHERE id = ?`, id)
	var img model.Image
	var createdAt string
	err := row.Scan(&img.ID, &img.EntryID, &img.Filename, &img.OriginalName, &img.Order, &createdAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if img.CreatedAt, err = time.Parse(time.RFC3339, createdAt); err != nil {
		return nil, err
	}
	return &img, nil
}

func (r *imageRepository) Save(ctx context.Context, img *model.Image) error {
	result, err := r.db.ExecContext(ctx,
		`INSERT INTO images (entry_id, filename, original_name, sort_order, created_at) VALUES (?, ?, ?, ?, ?)`,
		img.EntryID, img.Filename, img.OriginalName, img.Order, img.CreatedAt.Format(time.RFC3339),
	)
	if err != nil {
		return err
	}
	id, err := result.LastInsertId()
	if err != nil {
		return err
	}
	img.ID = id
	return nil
}

func (r *imageRepository) Delete(ctx context.Context, id int64) (*model.Image, error) {
	img, err := r.FindByID(ctx, id)
	if err != nil {
		return nil, err
	}
	if img == nil {
		return nil, nil
	}
	_, err = r.db.ExecContext(ctx, `DELETE FROM images WHERE id = ?`, id)
	return img, err
}

func scanImageRow(rows *sql.Rows) (*model.Image, error) {
	var img model.Image
	var createdAt string
	var err error
	if err = rows.Scan(&img.ID, &img.EntryID, &img.Filename, &img.OriginalName, &img.Order, &createdAt); err != nil {
		return nil, err
	}
	if img.CreatedAt, err = time.Parse(time.RFC3339, createdAt); err != nil {
		return nil, err
	}
	return &img, nil
}
