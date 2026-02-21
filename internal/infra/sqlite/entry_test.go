package sqlite_test

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"private_diary/internal/infra/sqlite"
	"private_diary/internal/model"
)

func newEntry(date, body string) *model.Entry {
	now := time.Now()
	return &model.Entry{Date: date, Body: body, CreatedAt: now, UpdatedAt: now}
}

func TestEntryRepository_SaveAndFindByDate(t *testing.T) {
	db := newTestDB(t)
	repo := sqlite.NewEntryRepository(db)
	ctx := context.Background()

	e := newEntry("2024-03-15", "本文テスト")
	require.NoError(t, repo.Save(ctx, e))
	assert.NotZero(t, e.ID)

	got, err := repo.FindByDate(ctx, "2024-03-15")
	require.NoError(t, err)
	require.NotNil(t, got)
	assert.Equal(t, "2024-03-15", got.Date)
	assert.Equal(t, "本文テスト", got.Body)
}

func TestEntryRepository_FindByDate_NotFound(t *testing.T) {
	db := newTestDB(t)
	repo := sqlite.NewEntryRepository(db)

	got, err := repo.FindByDate(context.Background(), "2024-01-01")
	require.NoError(t, err)
	assert.Nil(t, got)
}

func TestEntryRepository_Save_DuplicateDate(t *testing.T) {
	db := newTestDB(t)
	repo := sqlite.NewEntryRepository(db)
	ctx := context.Background()

	require.NoError(t, repo.Save(ctx, newEntry("2024-03-15", "初回")))
	err := repo.Save(ctx, newEntry("2024-03-15", "重複"))
	assert.Error(t, err, "UNIQUE制約でエラーになること")
}

func TestEntryRepository_Update(t *testing.T) {
	db := newTestDB(t)
	repo := sqlite.NewEntryRepository(db)
	ctx := context.Background()

	e := newEntry("2024-03-15", "元の本文")
	require.NoError(t, repo.Save(ctx, e))

	e.Body = "更新後の本文"
	e.UpdatedAt = time.Now()
	require.NoError(t, repo.Update(ctx, e))

	got, err := repo.FindByDate(ctx, "2024-03-15")
	require.NoError(t, err)
	assert.Equal(t, "更新後の本文", got.Body)
}

func TestEntryRepository_Delete(t *testing.T) {
	db := newTestDB(t)
	repo := sqlite.NewEntryRepository(db)
	ctx := context.Background()

	require.NoError(t, repo.Save(ctx, newEntry("2024-03-15", "本文")))
	require.NoError(t, repo.Delete(ctx, "2024-03-15"))

	got, err := repo.FindByDate(ctx, "2024-03-15")
	require.NoError(t, err)
	assert.Nil(t, got)
}

func TestEntryRepository_ExistsDate(t *testing.T) {
	db := newTestDB(t)
	repo := sqlite.NewEntryRepository(db)
	ctx := context.Background()

	exists, err := repo.ExistsDate(ctx, "2024-03-15")
	require.NoError(t, err)
	assert.False(t, exists)

	require.NoError(t, repo.Save(ctx, newEntry("2024-03-15", "本文")))

	exists, err = repo.ExistsDate(ctx, "2024-03-15")
	require.NoError(t, err)
	assert.True(t, exists)
}

func TestEntryRepository_List(t *testing.T) {
	db := newTestDB(t)
	repo := sqlite.NewEntryRepository(db)
	ctx := context.Background()

	dates := []string{"2024-01-01", "2024-02-01", "2024-03-01", "2024-04-01", "2024-05-01"}
	for _, d := range dates {
		require.NoError(t, repo.Save(ctx, newEntry(d, "本文 "+d)))
	}

	t.Run("全件取得", func(t *testing.T) {
		entries, total, err := repo.List(ctx, model.ListParams{Page: 1, PageSize: 10})
		require.NoError(t, err)
		assert.Equal(t, 5, total)
		assert.Len(t, entries, 5)
		// 新しい順
		assert.Equal(t, "2024-05-01", entries[0].Date)
	})

	t.Run("ページネーション", func(t *testing.T) {
		entries, total, err := repo.List(ctx, model.ListParams{Page: 1, PageSize: 2})
		require.NoError(t, err)
		assert.Equal(t, 5, total)
		assert.Len(t, entries, 2)
	})

	t.Run("キーワード検索", func(t *testing.T) {
		entries, total, err := repo.List(ctx, model.ListParams{Page: 1, PageSize: 10, Query: "2024-03"})
		require.NoError(t, err)
		assert.Equal(t, 1, total)
		assert.Equal(t, "2024-03-01", entries[0].Date)
	})

	t.Run("日付範囲絞り込み", func(t *testing.T) {
		entries, total, err := repo.List(ctx, model.ListParams{Page: 1, PageSize: 10, From: "2024-02-01", To: "2024-03-01"})
		require.NoError(t, err)
		assert.Equal(t, 2, total)
		_ = entries
	})
}

func TestEntryRepository_ListForExport(t *testing.T) {
	db := newTestDB(t)
	repo := sqlite.NewEntryRepository(db)
	ctx := context.Background()

	for _, d := range []string{"2024-01-01", "2024-06-01", "2024-12-31"} {
		require.NoError(t, repo.Save(ctx, newEntry(d, "本文")))
	}

	t.Run("全件", func(t *testing.T) {
		entries, err := repo.ListForExport(ctx, "", "")
		require.NoError(t, err)
		assert.Len(t, entries, 3)
	})

	t.Run("期間絞り込み", func(t *testing.T) {
		entries, err := repo.ListForExport(ctx, "2024-06-01", "2024-12-31")
		require.NoError(t, err)
		assert.Len(t, entries, 2)
	})
}
