package service_test

import (
	"context"
	"io"

	"private_diary/internal/model"
)

// --- MockEntryRepository ---

type mockEntryRepo struct {
	findByDate    func(ctx context.Context, date string) (*model.Entry, error)
	list          func(ctx context.Context, params model.ListParams) ([]*model.Entry, int, error)
	save          func(ctx context.Context, entry *model.Entry) error
	update        func(ctx context.Context, entry *model.Entry) error
	delete        func(ctx context.Context, date string) error
	existsDate    func(ctx context.Context, date string) (bool, error)
	listForExport func(ctx context.Context, from, to string) ([]*model.Entry, error)
}

func (m *mockEntryRepo) FindByDate(ctx context.Context, date string) (*model.Entry, error) {
	return m.findByDate(ctx, date)
}
func (m *mockEntryRepo) List(ctx context.Context, p model.ListParams) ([]*model.Entry, int, error) {
	return m.list(ctx, p)
}
func (m *mockEntryRepo) Save(ctx context.Context, e *model.Entry) error {
	return m.save(ctx, e)
}
func (m *mockEntryRepo) Update(ctx context.Context, e *model.Entry) error {
	return m.update(ctx, e)
}
func (m *mockEntryRepo) Delete(ctx context.Context, date string) error {
	return m.delete(ctx, date)
}
func (m *mockEntryRepo) ExistsDate(ctx context.Context, date string) (bool, error) {
	return m.existsDate(ctx, date)
}
func (m *mockEntryRepo) ListForExport(ctx context.Context, from, to string) ([]*model.Entry, error) {
	return m.listForExport(ctx, from, to)
}

// --- MockImageRepository ---

type mockImageRepo struct {
	findByEntryID func(ctx context.Context, entryID int64) ([]*model.Image, error)
	findByID      func(ctx context.Context, id int64) (*model.Image, error)
	save          func(ctx context.Context, img *model.Image) error
	delete        func(ctx context.Context, id int64) (*model.Image, error)
}

func (m *mockImageRepo) FindByEntryID(ctx context.Context, id int64) ([]*model.Image, error) {
	return m.findByEntryID(ctx, id)
}
func (m *mockImageRepo) FindByID(ctx context.Context, id int64) (*model.Image, error) {
	return m.findByID(ctx, id)
}
func (m *mockImageRepo) Save(ctx context.Context, img *model.Image) error {
	return m.save(ctx, img)
}
func (m *mockImageRepo) Delete(ctx context.Context, id int64) (*model.Image, error) {
	return m.delete(ctx, id)
}

// --- MockStorage ---

type mockStorage struct {
	save   func(filename string, r io.Reader) error
	delete func(filename string) error
	open   func(filename string) (io.ReadCloser, error)
}

func (m *mockStorage) Save(filename string, r io.Reader) error {
	return m.save(filename, r)
}
func (m *mockStorage) Delete(filename string) error {
	return m.delete(filename)
}
func (m *mockStorage) Open(filename string) (io.ReadCloser, error) {
	return m.open(filename)
}
