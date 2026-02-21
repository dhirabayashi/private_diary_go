package service

import (
	"context"
	"errors"
	"time"

	"private_diary/internal/domain"
	"private_diary/internal/model"
	"private_diary/internal/repository"
)

type EntryService interface {
	Create(ctx context.Context, date, body string) (*model.Entry, error)
	Update(ctx context.Context, date, body string) (*model.Entry, error)
	Delete(ctx context.Context, date string) error
	GetByDate(ctx context.Context, date string) (*model.Entry, error)
	List(ctx context.Context, params model.ListParams) ([]*model.Entry, int, error)
}

type entryService struct {
	repo      repository.EntryRepository
	imageRepo repository.ImageRepository
	storage   repository.Storage
}

func NewEntryService(repo repository.EntryRepository, imageRepo repository.ImageRepository, storage repository.Storage) EntryService {
	return &entryService{repo: repo, imageRepo: imageRepo, storage: storage}
}

func (s *entryService) Create(ctx context.Context, date, body string) (*model.Entry, error) {
	_, err := domain.ParseEntryDate(date, time.Now().In(domain.JST))
	if err != nil {
		if errors.Is(err, domain.ErrFutureDate) {
			return nil, ErrFutureDate
		}
		return nil, ErrInvalidDate
	}

	exists, err := s.repo.ExistsDate(ctx, date)
	if err != nil {
		return nil, err
	}
	if exists {
		return nil, ErrDuplicateDate
	}

	now := time.Now()
	entry := &model.Entry{
		Date:      date,
		Body:      body,
		CreatedAt: now,
		UpdatedAt: now,
	}

	if err := s.repo.Save(ctx, entry); err != nil {
		return nil, err
	}
	return entry, nil
}

func (s *entryService) Update(ctx context.Context, date, body string) (*model.Entry, error) {
	entry, err := s.repo.FindByDate(ctx, date)
	if err != nil {
		return nil, err
	}
	if entry == nil {
		return nil, ErrNotFound
	}

	entry.Body = body
	entry.UpdatedAt = time.Now()

	if err := s.repo.Update(ctx, entry); err != nil {
		return nil, err
	}
	return entry, nil
}

func (s *entryService) Delete(ctx context.Context, date string) error {
	entry, err := s.repo.FindByDate(ctx, date)
	if err != nil {
		return err
	}
	if entry == nil {
		return ErrNotFound
	}

	// 画像ファイルをストレージから削除してからエントリを削除する。
	// DB の CASCADE でレコードは消えるが、ファイルは別途削除が必要。
	images, err := s.imageRepo.FindByEntryID(ctx, entry.ID)
	if err != nil {
		return err
	}
	for _, img := range images {
		if err := s.storage.Delete(img.Filename); err != nil {
			return err
		}
	}

	return s.repo.Delete(ctx, date)
}

func (s *entryService) GetByDate(ctx context.Context, date string) (*model.Entry, error) {
	entry, err := s.repo.FindByDate(ctx, date)
	if err != nil {
		return nil, err
	}
	if entry == nil {
		return nil, ErrNotFound
	}
	return entry, nil
}

func (s *entryService) List(ctx context.Context, params model.ListParams) ([]*model.Entry, int, error) {
	if params.PageSize <= 0 {
		params.PageSize = 10
	}
	if params.Page <= 0 {
		params.Page = 1
	}
	entries, total, err := s.repo.List(ctx, params)
	if err != nil {
		return nil, 0, err
	}
	for _, e := range entries {
		e.Preview = domain.GeneratePreview(e.Body)
	}
	return entries, total, nil
}
