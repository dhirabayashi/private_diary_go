package repository

import (
	"context"

	"private_diary/internal/model"
)

type ImageRepository interface {
	FindByEntryID(ctx context.Context, entryID int64) ([]*model.Image, error)
	FindByID(ctx context.Context, id int64) (*model.Image, error)
	Save(ctx context.Context, image *model.Image) error
	Delete(ctx context.Context, id int64) (*model.Image, error)
}
