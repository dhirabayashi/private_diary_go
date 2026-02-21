package repository

import (
	"context"

	"private_diary/internal/model"
)

type EntryRepository interface {
	FindByDate(ctx context.Context, date string) (*model.Entry, error)
	List(ctx context.Context, params model.ListParams) ([]*model.Entry, int, error)
	Save(ctx context.Context, entry *model.Entry) error
	Update(ctx context.Context, entry *model.Entry) error
	Delete(ctx context.Context, date string) error
	ExistsDate(ctx context.Context, date string) (bool, error)
	ListForExport(ctx context.Context, from, to string) ([]*model.Entry, error)
}
