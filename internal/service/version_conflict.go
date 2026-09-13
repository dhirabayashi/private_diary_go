package service

import (
	"context"

	"private_diary/internal/repository"
)

// resolveVersionConflict はrepo.Updateがversion不一致で失敗した直後に呼び、
// サーバー側の現在の状態を読み直して結果を判定する。
// その間にエントリ自体が削除されていた場合はErrNotFoundを返す（＝競合ではなく削除なので、
// クライアントに「読み込み直す/上書き保存する」という競合UIを提示するのは適切ではない）。
func resolveVersionConflict(ctx context.Context, repo repository.EntryRepository, date string) (*VersionConflictError, error) {
	current, err := repo.FindByDate(ctx, date)
	if err != nil {
		return nil, err
	}
	if current == nil {
		return nil, ErrNotFound
	}
	return &VersionConflictError{CurrentVersion: current.Version}, nil
}
