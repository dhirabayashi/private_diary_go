package main

import (
	"embed"
	"io/fs"
	"log/slog"
	"net/http"
	"os"

	"private_diary/internal/handler"
	"private_diary/internal/infra/db"
	infraSQLite "private_diary/internal/infra/sqlite"
	"private_diary/internal/infra/storage"
	"private_diary/internal/service"
)

//go:embed frontend/dist
var frontendFS embed.FS

func main() {
	port := getenv("DIARY_PORT", "8080")
	dbPath := getenv("DIARY_DB_PATH", "./diary.db")
	imageDir := getenv("DIARY_IMAGE_DIR", "./data/images")

	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, nil)))

	database, err := db.Open(dbPath)
	if err != nil {
		slog.Error("failed to open database", "error", err)
		os.Exit(1)
	}
	defer database.Close()

	store := storage.NewLocalStorage(imageDir)

	entryRepo := infraSQLite.NewEntryRepository(database)
	imageRepo := infraSQLite.NewImageRepository(database)

	entryService := service.NewEntryService(entryRepo, imageRepo, store)
	imageService := service.NewImageService(imageRepo, store)
	importService := service.NewImportService(entryRepo)
	exportService := service.NewExportService(entryRepo, imageRepo, store)

	distFS, err := fs.Sub(frontendFS, "frontend/dist")
	if err != nil {
		slog.Error("failed to sub frontend/dist", "error", err)
		os.Exit(1)
	}

	r := handler.NewRouter(entryService, imageService, importService, exportService, imageDir, distFS)

	slog.Info("starting diary server", "port", port, "db", dbPath, "imageDir", imageDir)
	if err := http.ListenAndServe(":"+port, r); err != nil {
		slog.Error("server stopped", "error", err)
		os.Exit(1)
	}
}

func getenv(key, defaultVal string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return defaultVal
}
