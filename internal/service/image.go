package service

import (
	"context"
	"fmt"
	"io"
	"path/filepath"
	"strings"
	"time"

	"github.com/google/uuid"

	"private_diary/internal/model"
	"private_diary/internal/repository"
)

var allowedImageExts = map[string]bool{
	".jpg": true, ".jpeg": true, ".png": true, ".gif": true, ".webp": true,
}

type ImageService interface {
	AddImage(ctx context.Context, entryID int64, originalName string, r io.Reader) (*model.Image, error)
	DeleteImage(ctx context.Context, id int64) error
	GetImagesForEntry(ctx context.Context, entryID int64) ([]*model.Image, error)
}

type imageService struct {
	repo    repository.ImageRepository
	storage repository.Storage
}

func NewImageService(repo repository.ImageRepository, storage repository.Storage) ImageService {
	return &imageService{repo: repo, storage: storage}
}

func (s *imageService) AddImage(ctx context.Context, entryID int64, originalName string, r io.Reader) (*model.Image, error) {
	ext := strings.ToLower(filepath.Ext(originalName))
	if !allowedImageExts[ext] {
		return nil, ErrInvalidImage
	}

	filename := fmt.Sprintf("%s%s", uuid.New().String(), ext)
	if err := s.storage.Save(filename, r); err != nil {
		return nil, err
	}

	img := &model.Image{
		EntryID:      entryID,
		Filename:     filename,
		OriginalName: originalName,
		Order:        0,
		CreatedAt:    time.Now(),
	}

	if err := s.repo.Save(ctx, img); err != nil {
		if delErr := s.storage.Delete(filename); delErr != nil {
			return nil, fmt.Errorf("%w; storage cleanup: %v", err, delErr)
		}
		return nil, err
	}
	return img, nil
}

func (s *imageService) DeleteImage(ctx context.Context, id int64) error {
	img, err := s.repo.Delete(ctx, id)
	if err != nil {
		return err
	}
	if img == nil {
		return ErrNotFound
	}
	return s.storage.Delete(img.Filename)
}

func (s *imageService) GetImagesForEntry(ctx context.Context, entryID int64) ([]*model.Image, error) {
	return s.repo.FindByEntryID(ctx, entryID)
}
