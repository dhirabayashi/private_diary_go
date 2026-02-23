package handler_test

import (
	"context"
	"io"

	"private_diary/internal/model"
	"private_diary/internal/service"
)

// --- mockEntryService ---

type mockEntryService struct {
	create    func(ctx context.Context, date, body string) (*model.Entry, error)
	update    func(ctx context.Context, date, body string) (*model.Entry, error)
	delete    func(ctx context.Context, date string) error
	getByDate func(ctx context.Context, date string) (*model.Entry, error)
	list      func(ctx context.Context, params model.ListParams) ([]*model.Entry, int, error)
}

func (m *mockEntryService) Create(ctx context.Context, date, body string) (*model.Entry, error) {
	return m.create(ctx, date, body)
}
func (m *mockEntryService) Update(ctx context.Context, date, body string) (*model.Entry, error) {
	return m.update(ctx, date, body)
}
func (m *mockEntryService) Delete(ctx context.Context, date string) error {
	return m.delete(ctx, date)
}
func (m *mockEntryService) GetByDate(ctx context.Context, date string) (*model.Entry, error) {
	return m.getByDate(ctx, date)
}
func (m *mockEntryService) List(ctx context.Context, params model.ListParams) ([]*model.Entry, int, error) {
	return m.list(ctx, params)
}

// --- mockImageService ---

type mockImageService struct {
	addImage          func(ctx context.Context, entryID int64, originalName string, r io.Reader) (*model.Image, error)
	deleteImage       func(ctx context.Context, id int64) error
	getImagesForEntry func(ctx context.Context, entryID int64) ([]*model.Image, error)
}

func (m *mockImageService) AddImage(ctx context.Context, entryID int64, name string, r io.Reader) (*model.Image, error) {
	return m.addImage(ctx, entryID, name, r)
}
func (m *mockImageService) DeleteImage(ctx context.Context, id int64) error {
	return m.deleteImage(ctx, id)
}
func (m *mockImageService) GetImagesForEntry(ctx context.Context, entryID int64) ([]*model.Image, error) {
	return m.getImagesForEntry(ctx, entryID)
}

// --- mockImportService ---

type mockImportService struct {
	importFn    func(ctx context.Context, filename string, r io.Reader, overwrite bool) (*model.Entry, bool, error)
	importZipFn func(ctx context.Context, r io.ReaderAt, size int64) (*service.ZipImportResult, error)
}

func (m *mockImportService) Import(ctx context.Context, filename string, r io.Reader, overwrite bool) (*model.Entry, bool, error) {
	return m.importFn(ctx, filename, r, overwrite)
}

func (m *mockImportService) ImportZip(ctx context.Context, r io.ReaderAt, size int64) (*service.ZipImportResult, error) {
	if m.importZipFn != nil {
		return m.importZipFn(ctx, r, size)
	}
	return &service.ZipImportResult{Skipped: []service.ZipSkippedEntry{}}, nil
}

// --- mockExportService ---

type mockExportService struct {
	exportFn func(ctx context.Context, w io.Writer, from, to string) (string, error)
}

func (m *mockExportService) Export(ctx context.Context, w io.Writer, from, to string) (string, error) {
	return m.exportFn(ctx, w, from, to)
}
