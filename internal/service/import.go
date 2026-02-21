package service

import (
	"context"
	"io"
	"time"

	"private_diary/internal/domain"
	"private_diary/internal/model"
	"private_diary/internal/repository"
)

type ImportService interface {
	// Import imports a text file. Returns (entry, needsConfirm, error).
	// needsConfirm=true means entry already exists and overwrite=false was passed.
	Import(ctx context.Context, filename string, r io.Reader, overwrite bool) (*model.Entry, bool, error)
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
		return nil, false, ErrInvalidFile
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
