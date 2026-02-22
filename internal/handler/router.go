package handler

import (
	"io/fs"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"

	"private_diary/internal/service"
)

func NewRouter(
	entryService service.EntryService,
	imageService service.ImageService,
	importService service.ImportService,
	exportService service.ExportService,
	imageDir string,
	frontendFS fs.FS,
) http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(middleware.RequestID)

	entryHandler := NewEntryHandler(entryService, imageService)
	imageHandler := NewImageHandler(imageService)
	importHandler := NewImportHandler(importService)
	exportHandler := NewExportHandler(exportService)

	r.Route("/api", func(r chi.Router) {
		r.Route("/entries", func(r chi.Router) {
			r.Get("/", entryHandler.List)
			r.Post("/", entryHandler.Create)
			r.Get("/{date}", entryHandler.GetByDate)
			r.Put("/{date}", entryHandler.Update)
			r.Delete("/{date}", entryHandler.Delete)
			r.Post("/{date}/images", entryHandler.UploadImage)
			r.Get("/{date}/export", entryHandler.ExportSingle)
		})
		r.Delete("/images/{id}", imageHandler.Delete)
		r.Post("/import", importHandler.Import)
		r.Post("/import/zip", importHandler.ImportZip)
		r.Get("/export", exportHandler.Export)
	})

	// Serve uploaded images from local filesystem
	r.Handle("/data/images/*", http.StripPrefix("/data/images/", http.FileServer(http.Dir(imageDir))))

	// Serve frontend (SPA with fallback to index.html)
	fileServer := http.FileServer(http.FS(frontendFS))
	r.Get("/*", func(w http.ResponseWriter, r *http.Request) {
		path := r.URL.Path[1:] // strip leading "/"
		if path == "" {
			path = "index.html"
		}
		f, err := frontendFS.Open(path)
		if err != nil {
			// Fallback to index.html for SPA routing
			r.URL.Path = "/"
			http.ServeFileFS(w, r, frontendFS, "index.html")
			return
		}
		f.Close()
		fileServer.ServeHTTP(w, r)
	})

	return r
}
