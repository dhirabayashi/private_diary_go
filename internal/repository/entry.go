package repository

import (
	"context"
	"errors"

	"private_diary/internal/model"
)

// ErrConflict はSaveでentry_dateが既に存在する場合（UNIQUE制約違反）に返される。
// ExistsDateによる事前チェックにはcheck-then-actの隙間が残るため、それを補う防御である。
var ErrConflict = errors.New("指定された日付のエントリは既に存在します")

type EntryRepository interface {
	FindByDate(ctx context.Context, date string) (*model.Entry, error)
	List(ctx context.Context, params model.ListParams) ([]*model.Entry, int, error)
	Save(ctx context.Context, entry *model.Entry) error
	// Update はexpectedVersionと一致する行のみ更新し、実際に更新できたかどうかを返す
	// （false = version不一致）。
	Update(ctx context.Context, entry *model.Entry, expectedVersion int) (bool, error)
	Delete(ctx context.Context, date string) error
	ExistsDate(ctx context.Context, date string) (bool, error)
	ListForExport(ctx context.Context, from, to string) ([]*model.Entry, error)
}
