package service

import (
	"archive/zip"
	"context"
	"fmt"
	"io"
	"strings"
	"time"

	"private_diary/internal/domain"
	"private_diary/internal/repository"
)

type ExportService interface {
	// Export writes a ZIP to w and returns the suggested filename.
	Export(ctx context.Context, w io.Writer, from, to string) (string, error)
}

type exportService struct {
	entryRepo repository.EntryRepository
	imageRepo repository.ImageRepository
	storage   repository.Storage
}

func NewExportService(entryRepo repository.EntryRepository, imageRepo repository.ImageRepository, storage repository.Storage) ExportService {
	return &exportService{entryRepo: entryRepo, imageRepo: imageRepo, storage: storage}
}

func (s *exportService) Export(ctx context.Context, w io.Writer, from, to string) (string, error) {
	entries, err := s.entryRepo.ListForExport(ctx, from, to)
	if err != nil {
		return "", err
	}

	// Determine date labels for ZIP filename
	var fromLabel, toLabel string
	if from != "" {
		fromLabel = strings.ReplaceAll(from, "-", "")
	} else if len(entries) > 0 {
		fromLabel = strings.ReplaceAll(entries[len(entries)-1].Date, "-", "")
	} else {
		fromLabel = time.Now().In(domain.JST).Format("20060102")
	}
	if to != "" {
		toLabel = strings.ReplaceAll(to, "-", "")
	} else if len(entries) > 0 {
		toLabel = strings.ReplaceAll(entries[0].Date, "-", "")
	} else {
		toLabel = time.Now().In(domain.JST).Format("20060102")
	}

	zipName := fmt.Sprintf("diary_export_%s_%s.zip", fromLabel, toLabel)

	zw := zip.NewWriter(w)
	defer zw.Close()

	for _, entry := range entries {
		compact := strings.ReplaceAll(entry.Date, "-", "")

		f, err := zw.Create(compact + ".txt")
		if err != nil {
			return "", err
		}
		if _, err := io.WriteString(f, entry.Body); err != nil {
			return "", err
		}

		images, err := s.imageRepo.FindByEntryID(ctx, entry.ID)
		if err != nil {
			return "", err
		}
		for _, img := range images {
			rc, err := s.storage.Open(img.Filename)
			if err != nil {
				return "", err
			}
			imgFile, err := zw.Create(fmt.Sprintf("images/%s/%s", compact, img.OriginalName))
			if err != nil {
				rc.Close()
				return "", err
			}
			if _, err = io.Copy(imgFile, rc); err != nil {
				rc.Close()
				return "", err
			}
			rc.Close()
		}
	}

	return zipName, nil
}
