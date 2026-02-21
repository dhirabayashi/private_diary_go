package service_test

import (
	"context"
	"errors"
	"io"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"private_diary/internal/model"
	"private_diary/internal/service"
)

// noopImageRepo はテスト中に画像が存在しない状況を想定した空実装。
func noopImageRepo() *mockImageRepo {
	return &mockImageRepo{
		findByEntryID: func(_ context.Context, _ int64) ([]*model.Image, error) {
			return []*model.Image{}, nil
		},
		findByID: func(_ context.Context, _ int64) (*model.Image, error) { return nil, nil },
		save:     func(_ context.Context, _ *model.Image) error { return nil },
		delete:   func(_ context.Context, _ int64) (*model.Image, error) { return nil, nil },
	}
}

// noopStorage は何もしないストレージの空実装。
func noopStorage() *mockStorage {
	return &mockStorage{
		save:   func(_ string, _ io.Reader) error { return nil },
		delete: func(_ string) error { return nil },
		open:   func(_ string) (io.ReadCloser, error) { return nil, nil },
	}
}

func TestEntryService_Create(t *testing.T) {
	ctx := context.Background()

	t.Run("正常: 新規作成でSaveが呼ばれる", func(t *testing.T) {
		var savedEntry *model.Entry
		repo := &mockEntryRepo{
			existsDate: func(_ context.Context, date string) (bool, error) { return false, nil },
			save: func(_ context.Context, e *model.Entry) error {
				savedEntry = e
				e.ID = 1
				return nil
			},
		}
		svc := service.NewEntryService(repo, noopImageRepo(), noopStorage())
		entry, err := svc.Create(ctx, "2024-03-15", "本文")
		require.NoError(t, err)
		require.NotNil(t, savedEntry)
		assert.Equal(t, "2024-03-15", entry.Date)
		assert.Equal(t, "本文", entry.Body)
	})

	t.Run("異常: 未来日はエラー", func(t *testing.T) {
		svc := service.NewEntryService(&mockEntryRepo{}, noopImageRepo(), noopStorage())
		// サービス内部は JST 基準なので JST で翌日を計算する
		jst := time.FixedZone("JST", 9*60*60)
		futureDate := time.Now().In(jst).AddDate(0, 0, 1).Format("2006-01-02")
		_, err := svc.Create(ctx, futureDate, "本文")
		assert.ErrorIs(t, err, service.ErrFutureDate)
	})

	t.Run("異常: 不正な日付形式はエラー", func(t *testing.T) {
		svc := service.NewEntryService(&mockEntryRepo{}, noopImageRepo(), noopStorage())
		_, err := svc.Create(ctx, "20240315", "本文")
		assert.ErrorIs(t, err, service.ErrInvalidDate)
	})

	t.Run("異常: 重複日付はSaveを呼ばずエラー", func(t *testing.T) {
		saveCalled := false
		repo := &mockEntryRepo{
			existsDate: func(_ context.Context, date string) (bool, error) { return true, nil },
			save:       func(_ context.Context, e *model.Entry) error { saveCalled = true; return nil },
		}
		svc := service.NewEntryService(repo, noopImageRepo(), noopStorage())
		_, err := svc.Create(ctx, "2024-03-15", "本文")
		assert.ErrorIs(t, err, service.ErrDuplicateDate)
		assert.False(t, saveCalled, "重複時はSaveを呼ばない")
	})

	t.Run("異常: Repositoryエラーは伝播する", func(t *testing.T) {
		repoErr := errors.New("db error")
		repo := &mockEntryRepo{
			existsDate: func(_ context.Context, date string) (bool, error) { return false, nil },
			save:       func(_ context.Context, e *model.Entry) error { return repoErr },
		}
		svc := service.NewEntryService(repo, noopImageRepo(), noopStorage())
		_, err := svc.Create(ctx, "2024-03-15", "本文")
		assert.ErrorIs(t, err, repoErr)
	})
}

func TestEntryService_Update(t *testing.T) {
	ctx := context.Background()

	t.Run("正常: 本文が更新される", func(t *testing.T) {
		existing := &model.Entry{ID: 1, Date: "2024-03-15", Body: "旧本文"}
		var updatedEntry *model.Entry
		repo := &mockEntryRepo{
			findByDate: func(_ context.Context, date string) (*model.Entry, error) { return existing, nil },
			update: func(_ context.Context, e *model.Entry) error {
				updatedEntry = e
				return nil
			},
		}
		svc := service.NewEntryService(repo, noopImageRepo(), noopStorage())
		entry, err := svc.Update(ctx, "2024-03-15", "新本文")
		require.NoError(t, err)
		assert.Equal(t, "新本文", entry.Body)
		assert.Equal(t, "新本文", updatedEntry.Body)
	})

	t.Run("異常: 存在しない日付はErrNotFound", func(t *testing.T) {
		repo := &mockEntryRepo{
			findByDate: func(_ context.Context, date string) (*model.Entry, error) { return nil, nil },
		}
		svc := service.NewEntryService(repo, noopImageRepo(), noopStorage())
		_, err := svc.Update(ctx, "2024-03-15", "本文")
		assert.ErrorIs(t, err, service.ErrNotFound)
	})
}

func TestEntryService_Delete(t *testing.T) {
	ctx := context.Background()

	t.Run("正常: Deleteが呼ばれる", func(t *testing.T) {
		deleteCalled := false
		repo := &mockEntryRepo{
			findByDate: func(_ context.Context, date string) (*model.Entry, error) {
				return &model.Entry{ID: 1, Date: date}, nil
			},
			delete: func(_ context.Context, date string) error { deleteCalled = true; return nil },
		}
		svc := service.NewEntryService(repo, noopImageRepo(), noopStorage())
		err := svc.Delete(ctx, "2024-03-15")
		require.NoError(t, err)
		assert.True(t, deleteCalled)
	})

	t.Run("正常: 画像ファイルがストレージから削除される", func(t *testing.T) {
		deletedFiles := []string{}
		repo := &mockEntryRepo{
			findByDate: func(_ context.Context, date string) (*model.Entry, error) {
				return &model.Entry{ID: 1, Date: date}, nil
			},
			delete: func(_ context.Context, date string) error { return nil },
		}
		imgRepo := &mockImageRepo{
			findByEntryID: func(_ context.Context, entryID int64) ([]*model.Image, error) {
				return []*model.Image{
					{ID: 1, Filename: "uuid1.jpg", CreatedAt: time.Now()},
					{ID: 2, Filename: "uuid2.png", CreatedAt: time.Now()},
				}, nil
			},
		}
		store := &mockStorage{
			delete: func(filename string) error {
				deletedFiles = append(deletedFiles, filename)
				return nil
			},
		}
		svc := service.NewEntryService(repo, imgRepo, store)
		err := svc.Delete(ctx, "2024-03-15")
		require.NoError(t, err)
		assert.ElementsMatch(t, []string{"uuid1.jpg", "uuid2.png"}, deletedFiles,
			"紐づく画像ファイルがすべて削除されること")
	})

	t.Run("異常: 存在しない日付はErrNotFound", func(t *testing.T) {
		repo := &mockEntryRepo{
			findByDate: func(_ context.Context, date string) (*model.Entry, error) { return nil, nil },
		}
		svc := service.NewEntryService(repo, noopImageRepo(), noopStorage())
		err := svc.Delete(ctx, "2024-03-15")
		assert.ErrorIs(t, err, service.ErrNotFound)
	})
}

func TestEntryService_GetByDate(t *testing.T) {
	ctx := context.Background()

	t.Run("正常: エントリが返る", func(t *testing.T) {
		existing := &model.Entry{ID: 1, Date: "2024-03-15", Body: "本文"}
		repo := &mockEntryRepo{
			findByDate: func(_ context.Context, date string) (*model.Entry, error) { return existing, nil },
		}
		svc := service.NewEntryService(repo, noopImageRepo(), noopStorage())
		entry, err := svc.GetByDate(ctx, "2024-03-15")
		require.NoError(t, err)
		assert.Equal(t, existing.ID, entry.ID)
	})

	t.Run("異常: 見つからない場合はErrNotFound", func(t *testing.T) {
		repo := &mockEntryRepo{
			findByDate: func(_ context.Context, date string) (*model.Entry, error) { return nil, nil },
		}
		svc := service.NewEntryService(repo, noopImageRepo(), noopStorage())
		_, err := svc.GetByDate(ctx, "2024-03-15")
		assert.ErrorIs(t, err, service.ErrNotFound)
	})
}

func TestEntryService_List_GeneratesPreview(t *testing.T) {
	longBody := string(make([]rune, 150))
	for i := range []rune(longBody) {
		longBody = longBody[:i] + "あ" + longBody[i+1:]
	}
	repo := &mockEntryRepo{
		list: func(_ context.Context, p model.ListParams) ([]*model.Entry, int, error) {
			return []*model.Entry{{ID: 1, Date: "2024-03-15", Body: longBody}}, 1, nil
		},
	}
	svc := service.NewEntryService(repo, noopImageRepo(), noopStorage())
	entries, _, err := svc.List(context.Background(), model.ListParams{Page: 1, PageSize: 10})
	require.NoError(t, err)
	require.Len(t, entries, 1)
	assert.NotEmpty(t, entries[0].Preview)
	assert.Contains(t, entries[0].Preview, "...")
}
