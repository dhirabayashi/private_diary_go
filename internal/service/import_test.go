package service_test

import (
	"context"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"private_diary/internal/model"
	"private_diary/internal/service"
)

func TestImportService_Import(t *testing.T) {
	ctx := context.Background()

	t.Run("正常: 新規インポート", func(t *testing.T) {
		var savedEntry *model.Entry
		repo := &mockEntryRepo{
			existsDate: func(_ context.Context, date string) (bool, error) { return false, nil },
			save: func(_ context.Context, e *model.Entry) error {
				savedEntry = e
				e.ID = 1
				return nil
			},
		}
		svc := service.NewImportService(repo)
		entry, needsConfirm, err := svc.Import(ctx, "20240315.txt", strings.NewReader("本文内容"), false)
		require.NoError(t, err)
		assert.False(t, needsConfirm)
		require.NotNil(t, entry)
		assert.Equal(t, "2024-03-15", entry.Date)
		assert.Equal(t, "本文内容", entry.Body)
		assert.Equal(t, "本文内容", savedEntry.Body)
	})

	t.Run("異常: 不正なファイル名はErrInvalidFile", func(t *testing.T) {
		repo := &mockEntryRepo{}
		svc := service.NewImportService(repo)
		_, _, err := svc.Import(ctx, "invalid.txt", strings.NewReader("本文"), false)
		assert.ErrorIs(t, err, service.ErrInvalidFile)
	})

	t.Run("既存エントリあり・overwrite=false → needsConfirm=true", func(t *testing.T) {
		repo := &mockEntryRepo{
			existsDate: func(_ context.Context, date string) (bool, error) { return true, nil },
		}
		svc := service.NewImportService(repo)
		entry, needsConfirm, err := svc.Import(ctx, "20240315.txt", strings.NewReader("本文"), false)
		require.NoError(t, err)
		assert.True(t, needsConfirm)
		assert.Nil(t, entry)
	})

	t.Run("既存エントリあり・overwrite=true → Updateが呼ばれる", func(t *testing.T) {
		existing := &model.Entry{ID: 1, Date: "2024-03-15", Body: "旧本文"}
		updateCalled := false
		repo := &mockEntryRepo{
			existsDate: func(_ context.Context, date string) (bool, error) { return true, nil },
			findByDate: func(_ context.Context, date string) (*model.Entry, error) { return existing, nil },
			update: func(_ context.Context, e *model.Entry) error {
				updateCalled = true
				return nil
			},
		}
		svc := service.NewImportService(repo)
		entry, needsConfirm, err := svc.Import(ctx, "20240315.txt", strings.NewReader("新本文"), true)
		require.NoError(t, err)
		assert.False(t, needsConfirm)
		assert.True(t, updateCalled)
		assert.Equal(t, "新本文", entry.Body)
	})
}
