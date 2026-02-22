package service

import (
	"archive/zip"
	"context"
	"errors"
	"io"
	"path"
	"time"

	"private_diary/internal/domain"
	"private_diary/internal/model"
	"private_diary/internal/repository"
)

type ZipSkippedEntry struct {
	Date   string `json:"date"`
	Reason string `json:"reason"`
}

type ZipImportResult struct {
	Imported int               `json:"imported"`
	Skipped  []ZipSkippedEntry `json:"skipped"`
}

type ImportService interface {
	// Import imports a text file. Returns (entry, needsConfirm, error).
	// needsConfirm=true means entry already exists and overwrite=false was passed.
	Import(ctx context.Context, filename string, r io.Reader, overwrite bool) (*model.Entry, bool, error)
	// ImportZip imports multiple text files from a ZIP archive.
	// Files with invalid names are silently ignored. Files for existing dates are skipped and reported.
	ImportZip(ctx context.Context, r io.ReaderAt, size int64) (*ZipImportResult, error)
}

type importService struct {
	repo repository.EntryRepository
}

func NewImportService(repo repository.EntryRepository) ImportService {
	return &importService{repo: repo}
}

func (s *importService) Import(ctx context.Context, filename string, r io.Reader, overwrite bool) (*model.Entry, bool, error) {
	date, err := domain.ParseImportFilename(filename)
	if err != nil {
		return nil, false, ErrInvalidFilename
	}

	bodyBytes, err := io.ReadAll(r)
	if err != nil {
		return nil, false, err
	}
	body := string(bodyBytes)

	exists, err := s.repo.ExistsDate(ctx, date)
	if err != nil {
		return nil, false, err
	}

	if exists && !overwrite {
		return nil, true, nil
	}

	now := time.Now()
	if exists {
		entry, err := s.repo.FindByDate(ctx, date)
		if err != nil {
			return nil, false, err
		}
		entry.Body = body
		entry.UpdatedAt = now
		if err := s.repo.Update(ctx, entry); err != nil {
			return nil, false, err
		}
		return entry, false, nil
	}

	entry := &model.Entry{
		Date:      date,
		Body:      body,
		CreatedAt: now,
		UpdatedAt: now,
	}
	if err := s.repo.Save(ctx, entry); err != nil {
		return nil, false, err
	}
	return entry, false, nil
}

func readZipEntry(f *zip.File) ([]byte, error) {
	rc, err := f.Open()
	if err != nil {
		return nil, err
	}
	defer rc.Close()
	return io.ReadAll(rc)
}

func (s *importService) ImportZip(ctx context.Context, r io.ReaderAt, size int64) (*ZipImportResult, error) {
	zr, err := zip.NewReader(r, size)
	if err != nil {
		return nil, ErrInvalidZip
	}

	result := &ZipImportResult{
		Skipped: make([]ZipSkippedEntry, 0),
	}

	now := time.Now()

	for _, f := range zr.File {
		if f.FileInfo().IsDir() {
			continue
		}

		name := path.Base(f.Name)
		date, err := domain.ParseImportFilename(name)
		if err != nil {
			if errors.Is(err, domain.ErrInvalidFilename) {
				// invalid filename (e.g. .DS_Store) - silently ignore
				continue
			}
			return nil, err
		}

		exists, err := s.repo.ExistsDate(ctx, date)
		if err != nil {
			return nil, err
		}
		if exists {
			result.Skipped = append(result.Skipped, ZipSkippedEntry{Date: date, Reason: "already_exists"})
			continue
		}

		bodyBytes, err := readZipEntry(f)
		if err != nil {
			return nil, err
		}

		entry := &model.Entry{
			Date:      date,
			Body:      string(bodyBytes),
			CreatedAt: now,
			UpdatedAt: now,
		}
		if err := s.repo.Save(ctx, entry); err != nil {
			return nil, err
		}
		result.Imported++
	}

	return result, nil
}
