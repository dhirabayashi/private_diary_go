package service_test

import (
	"context"
	"errors"
	"io"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"private_diary/internal/model"
	"private_diary/internal/service"
)

func TestImageService_AddImage(t *testing.T) {
	ctx := context.Background()

	t.Run("正常: JPEG画像をアップロード", func(t *testing.T) {
		var savedFilename string
		var savedImg *model.Image

		storage := &mockStorage{
			save:   func(fn string, r io.Reader) error { savedFilename = fn; return nil },
			delete: func(fn string) error { return nil },
		}
		repo := &mockImageRepo{
			save: func(_ context.Context, img *model.Image) error {
				savedImg = img
				img.ID = 1
				return nil
			},
		}
		svc := service.NewImageService(repo, storage)
		img, err := svc.AddImage(ctx, 1, "photo.jpg", strings.NewReader("imagedata"))
		require.NoError(t, err)
		assert.NotNil(t, savedImg)
		assert.NotEmpty(t, savedFilename)
		assert.Equal(t, "photo.jpg", img.OriginalName)
	})

	t.Run("異常: 非対応拡張子はErrInvalidImage", func(t *testing.T) {
		storage := &mockStorage{}
		repo := &mockImageRepo{}
		svc := service.NewImageService(repo, storage)
		_, err := svc.AddImage(ctx, 1, "file.txt", strings.NewReader("data"))
		assert.ErrorIs(t, err, service.ErrInvalidImage)
	})

	t.Run("異常: ストレージ保存失敗時はRepositoryを呼ばない", func(t *testing.T) {
		storageErr := errors.New("disk full")
		saveCalled := false
		storage := &mockStorage{
			save: func(fn string, r io.Reader) error { return storageErr },
		}
		repo := &mockImageRepo{
			save: func(_ context.Context, img *model.Image) error { saveCalled = true; return nil },
		}
		svc := service.NewImageService(repo, storage)
		_, err := svc.AddImage(ctx, 1, "photo.jpg", strings.NewReader("data"))
		assert.ErrorIs(t, err, storageErr)
		assert.False(t, saveCalled)
	})

	t.Run("異常: DB保存失敗時はストレージファイルを削除する", func(t *testing.T) {
		var deletedFilename string
		storage := &mockStorage{
			save:   func(fn string, r io.Reader) error { return nil },
			delete: func(fn string) error { deletedFilename = fn; return nil },
		}
		repo := &mockImageRepo{
			save: func(_ context.Context, img *model.Image) error { return errors.New("db error") },
		}
		svc := service.NewImageService(repo, storage)
		_, err := svc.AddImage(ctx, 1, "photo.jpg", strings.NewReader("data"))
		assert.Error(t, err)
		assert.NotEmpty(t, deletedFilename, "DB失敗時はストレージからも削除する")
	})
}

func TestImageService_DeleteImage(t *testing.T) {
	ctx := context.Background()

	t.Run("正常: DBとストレージから削除される", func(t *testing.T) {
		var deletedFilename string
		img := &model.Image{ID: 1, Filename: "uuid.jpg", CreatedAt: time.Now()}
		repo := &mockImageRepo{
			delete: func(_ context.Context, id int64) (*model.Image, error) { return img, nil },
		}
		storage := &mockStorage{
			delete: func(fn string) error { deletedFilename = fn; return nil },
		}
		svc := service.NewImageService(repo, storage)
		err := svc.DeleteImage(ctx, 1)
		require.NoError(t, err)
		assert.Equal(t, "uuid.jpg", deletedFilename)
	})

	t.Run("異常: 存在しない画像はErrNotFound", func(t *testing.T) {
		repo := &mockImageRepo{
			delete: func(_ context.Context, id int64) (*model.Image, error) { return nil, nil },
		}
		svc := service.NewImageService(repo, &mockStorage{})
		err := svc.DeleteImage(ctx, 99)
		assert.ErrorIs(t, err, service.ErrNotFound)
	})
}
