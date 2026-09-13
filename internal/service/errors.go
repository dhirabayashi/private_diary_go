package service

import (
	"context"
	"errors"

	"private_diary/internal/repository"
)

var (
	ErrFutureDate      = errors.New("未来日には投稿できません")
	ErrDuplicateDate   = errors.New("その日付にはすでに日記が存在します")
	ErrNotFound        = errors.New("日記が見つかりません")
	ErrInvalidDate     = errors.New("日付の形式が正しくありません")
	ErrInvalidFilename = errors.New("不正なファイル名です")
	ErrInvalidZip      = errors.New("ZIPファイルが読み込めません")
	ErrInvalidImage    = errors.New("対応していない画像形式です")
	ErrVersionConflict = errors.New("他の変更と競合しました。最新の内容を確認してください")
)

// VersionConflictError はErrVersionConflictを競合発生時点のサーバー側versionとともに
// ラップする。これによりクライアントは再取得なしに、その版を対象にした強制保存を提示できる。
type VersionConflictError struct {
	CurrentVersion int
}

func (e *VersionConflictError) Error() string { return ErrVersionConflict.Error() }
func (e *VersionConflictError) Unwrap() error { return ErrVersionConflict }

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
