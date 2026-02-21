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

func TestImageRepository(t *testing.T) {
	db := newTestDB(t)
	entryRepo := sqlite.NewEntryRepository(db)
	imageRepo := sqlite.NewImageRepository(db)
	ctx := context.Background()

	// Setup: create an entry
	e := newEntry("2024-03-15", "本文")
	require.NoError(t, entryRepo.Save(ctx, e))
	entryID := e.ID

	t.Run("Save and FindByEntryID", func(t *testing.T) {
		img := &model.Image{
			EntryID:      entryID,
			Filename:     "uuid1.jpg",
			OriginalName: "photo.jpg",
			Order:        0,
			CreatedAt:    time.Now(),
		}
		require.NoError(t, imageRepo.Save(ctx, img))
		assert.NotZero(t, img.ID)

		imgs, err := imageRepo.FindByEntryID(ctx, entryID)
		require.NoError(t, err)
		require.Len(t, imgs, 1)
		assert.Equal(t, "uuid1.jpg", imgs[0].Filename)
		assert.Equal(t, "photo.jpg", imgs[0].OriginalName)
	})

	t.Run("FindByID", func(t *testing.T) {
		img := &model.Image{
			EntryID:      entryID,
			Filename:     "uuid2.png",
			OriginalName: "pic.png",
			Order:        1,
			CreatedAt:    time.Now(),
		}
		require.NoError(t, imageRepo.Save(ctx, img))

		got, err := imageRepo.FindByID(ctx, img.ID)
		require.NoError(t, err)
		require.NotNil(t, got)
		assert.Equal(t, img.ID, got.ID)
		assert.Equal(t, "uuid2.png", got.Filename)
	})

	t.Run("FindByID not found returns nil", func(t *testing.T) {
		got, err := imageRepo.FindByID(ctx, 99999)
		require.NoError(t, err)
		assert.Nil(t, got)
	})

	t.Run("Delete", func(t *testing.T) {
		img := &model.Image{
			EntryID:      entryID,
			Filename:     "uuid3.gif",
			OriginalName: "anim.gif",
			CreatedAt:    time.Now(),
		}
		require.NoError(t, imageRepo.Save(ctx, img))

		deleted, err := imageRepo.Delete(ctx, img.ID)
		require.NoError(t, err)
		require.NotNil(t, deleted)
		assert.Equal(t, img.ID, deleted.ID)

		got, err := imageRepo.FindByID(ctx, img.ID)
		require.NoError(t, err)
		assert.Nil(t, got)
	})

	t.Run("Delete not found returns nil", func(t *testing.T) {
		deleted, err := imageRepo.Delete(ctx, 99999)
		require.NoError(t, err)
		assert.Nil(t, deleted)
	})

	t.Run("CASCADE: entry削除で画像も削除される", func(t *testing.T) {
		e2 := newEntry("2024-04-01", "別エントリ")
		require.NoError(t, entryRepo.Save(ctx, e2))

		img := &model.Image{EntryID: e2.ID, Filename: "x.jpg", OriginalName: "x.jpg", CreatedAt: time.Now()}
		require.NoError(t, imageRepo.Save(ctx, img))

		require.NoError(t, entryRepo.Delete(ctx, "2024-04-01"))

		imgs, err := imageRepo.FindByEntryID(ctx, e2.ID)
		require.NoError(t, err)
		assert.Empty(t, imgs)
	})
}
