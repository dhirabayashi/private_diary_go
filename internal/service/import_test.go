package service_test

import (
	"archive/zip"
	"bytes"
	"context"
	"io"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"private_diary/internal/model"
	"private_diary/internal/service"
)

// makeZip はテスト用のZIPデータを作成する。files はパス→内容のマップ。
func makeZip(t *testing.T, files map[string]string) (io.ReaderAt, int64) {
	t.Helper()
	var buf bytes.Buffer
	w := zip.NewWriter(&buf)
	for name, content := range files {
		fw, err := w.Create(name)
		require.NoError(t, err)
		_, err = io.WriteString(fw, content)
		require.NoError(t, err)
	}
	require.NoError(t, w.Close())
	data := buf.Bytes()
	return bytes.NewReader(data), int64(len(data))
}

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

	t.Run("異常: 不正なファイル名はErrInvalidFilename", func(t *testing.T) {
		repo := &mockEntryRepo{}
		svc := service.NewImportService(repo)
		_, _, err := svc.Import(ctx, "invalid.txt", strings.NewReader("本文"), false)
		assert.ErrorIs(t, err, service.ErrInvalidFilename)
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

func TestImportService_ImportZip(t *testing.T) {
	ctx := context.Background()

	t.Run("正常: 複数ファイルを一括インポート", func(t *testing.T) {
		var savedDates []string
		repo := &mockEntryRepo{
			existsDate: func(_ context.Context, date string) (bool, error) { return false, nil },
			save: func(_ context.Context, e *model.Entry) error {
				savedDates = append(savedDates, e.Date)
				return nil
			},
		}
		svc := service.NewImportService(repo)
		r, size := makeZip(t, map[string]string{
			"20240101.txt": "元旦",
			"20240315.txt": "春分の日",
		})
		result, err := svc.ImportZip(ctx, r, size)
		require.NoError(t, err)
		assert.Equal(t, 2, result.Imported)
		assert.Empty(t, result.Skipped)
		assert.ElementsMatch(t, []string{"2024-01-01", "2024-03-15"}, savedDates)
	})

	t.Run("正常: 不正なファイル名は静かに無視される", func(t *testing.T) {
		repo := &mockEntryRepo{
			existsDate: func(_ context.Context, date string) (bool, error) { return false, nil },
			save:       func(_ context.Context, e *model.Entry) error { return nil },
		}
		svc := service.NewImportService(repo)
		r, size := makeZip(t, map[string]string{
			".DS_Store": "",
			"notes.txt": "メモ",
			"README.md": "説明",
		})
		result, err := svc.ImportZip(ctx, r, size)
		require.NoError(t, err)
		assert.Equal(t, 0, result.Imported)
		assert.Empty(t, result.Skipped)
	})

	t.Run("正常: 既存エントリはスキップされ結果に記録される", func(t *testing.T) {
		repo := &mockEntryRepo{
			existsDate: func(_ context.Context, date string) (bool, error) {
				return date == "2024-03-15", nil
			},
			save: func(_ context.Context, e *model.Entry) error { return nil },
		}
		svc := service.NewImportService(repo)
		r, size := makeZip(t, map[string]string{
			"20240315.txt": "既存",
			"20240316.txt": "新規",
		})
		result, err := svc.ImportZip(ctx, r, size)
		require.NoError(t, err)
		assert.Equal(t, 1, result.Imported)
		require.Len(t, result.Skipped, 1)
		assert.Equal(t, "2024-03-15", result.Skipped[0].Date)
		assert.Equal(t, "already_exists", result.Skipped[0].Reason)
	})

	t.Run("正常: ネストしたディレクトリ内のファイルもファイル名のみで判定される", func(t *testing.T) {
		var savedDate string
		repo := &mockEntryRepo{
			existsDate: func(_ context.Context, date string) (bool, error) { return false, nil },
			save: func(_ context.Context, e *model.Entry) error {
				savedDate = e.Date
				return nil
			},
		}
		svc := service.NewImportService(repo)
		r, size := makeZip(t, map[string]string{
			"subdir/nested/20240501.txt": "連休",
		})
		result, err := svc.ImportZip(ctx, r, size)
		require.NoError(t, err)
		assert.Equal(t, 1, result.Imported)
		assert.Equal(t, "2024-05-01", savedDate)
	})

	t.Run("異常: 不正なZIPデータはErrInvalidZip", func(t *testing.T) {
		repo := &mockEntryRepo{}
		svc := service.NewImportService(repo)
		invalid := bytes.NewReader([]byte("これはZIPではない"))
		_, err := svc.ImportZip(ctx, invalid, int64(len("これはZIPではない")))
		assert.ErrorIs(t, err, service.ErrInvalidZip)
	})
}
