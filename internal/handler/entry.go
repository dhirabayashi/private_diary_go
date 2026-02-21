package handler

import (
	"encoding/json"
	"errors"
	"log/slog"
	"mime"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"

	"private_diary/internal/model"
	"private_diary/internal/service"
)

type EntryHandler struct {
	entryService service.EntryService
	imageService service.ImageService
}

func NewEntryHandler(es service.EntryService, is service.ImageService) *EntryHandler {
	return &EntryHandler{entryService: es, imageService: is}
}

func (h *EntryHandler) List(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	page, _ := strconv.Atoi(q.Get("page"))
	pageSize, _ := strconv.Atoi(q.Get("page_size"))
	if page <= 0 {
		page = 1
	}
	if pageSize <= 0 {
		pageSize = 10
	}

	params := model.ListParams{
		Page:     page,
		PageSize: pageSize,
		Query:    q.Get("q"),
		From:     q.Get("from"),
		To:       q.Get("to"),
	}

	entries, total, err := h.entryService.List(r.Context(), params)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}

	for _, e := range entries {
		imgs, err := h.imageService.GetImagesForEntry(r.Context(), e.ID)
		if err != nil {
			respondError(w, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
			return
		}
		e.Images = imgs
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"data": map[string]interface{}{
			"entries":   entries,
			"total":     total,
			"page":      page,
			"page_size": pageSize,
		},
	})
}

func (h *EntryHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Date string `json:"date"`
		Body string `json:"body"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "INVALID_REQUEST", err.Error())
		return
	}

	entry, err := h.entryService.Create(r.Context(), req.Date, req.Body)
	if err != nil {
		switch {
		case errors.Is(err, service.ErrFutureDate):
			respondError(w, http.StatusBadRequest, "FUTURE_DATE", err.Error())
		case errors.Is(err, service.ErrDuplicateDate):
			respondError(w, http.StatusConflict, "DUPLICATE_DATE", err.Error())
		case errors.Is(err, service.ErrInvalidDate):
			respondError(w, http.StatusBadRequest, "INVALID_DATE", err.Error())
		default:
			respondError(w, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		}
		return
	}

	respondJSON(w, http.StatusCreated, map[string]interface{}{"data": entry})
}

func (h *EntryHandler) GetByDate(w http.ResponseWriter, r *http.Request) {
	date := chi.URLParam(r, "date")
	entry, err := h.entryService.GetByDate(r.Context(), date)
	if err != nil {
		if errors.Is(err, service.ErrNotFound) {
			respondError(w, http.StatusNotFound, "NOT_FOUND", err.Error())
			return
		}
		respondError(w, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}

	imgs, err := h.imageService.GetImagesForEntry(r.Context(), entry.ID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}
	entry.Images = imgs

	respondJSON(w, http.StatusOK, map[string]interface{}{"data": entry})
}

func (h *EntryHandler) Update(w http.ResponseWriter, r *http.Request) {
	date := chi.URLParam(r, "date")
	var req struct {
		Body string `json:"body"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "INVALID_REQUEST", err.Error())
		return
	}

	entry, err := h.entryService.Update(r.Context(), date, req.Body)
	if err != nil {
		if errors.Is(err, service.ErrNotFound) {
			respondError(w, http.StatusNotFound, "NOT_FOUND", err.Error())
			return
		}
		respondError(w, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}

	imgs, err := h.imageService.GetImagesForEntry(r.Context(), entry.ID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}
	entry.Images = imgs

	respondJSON(w, http.StatusOK, map[string]interface{}{"data": entry})
}

func (h *EntryHandler) Delete(w http.ResponseWriter, r *http.Request) {
	date := chi.URLParam(r, "date")
	if err := h.entryService.Delete(r.Context(), date); err != nil {
		if errors.Is(err, service.ErrNotFound) {
			respondError(w, http.StatusNotFound, "NOT_FOUND", err.Error())
			return
		}
		respondError(w, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// UploadImage handles POST /api/entries/:date/images
func (h *EntryHandler) UploadImage(w http.ResponseWriter, r *http.Request) {
	date := chi.URLParam(r, "date")
	entry, err := h.entryService.GetByDate(r.Context(), date)
	if err != nil {
		if errors.Is(err, service.ErrNotFound) {
			respondError(w, http.StatusNotFound, "NOT_FOUND", err.Error())
			return
		}
		respondError(w, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}

	if err := r.ParseMultipartForm(32 << 20); err != nil {
		respondError(w, http.StatusBadRequest, "INVALID_REQUEST", "failed to parse multipart form")
		return
	}
	file, header, err := r.FormFile("image")
	if err != nil {
		respondError(w, http.StatusBadRequest, "INVALID_REQUEST", "image field required")
		return
	}
	defer file.Close()

	img, err := h.imageService.AddImage(r.Context(), entry.ID, header.Filename, file)
	if err != nil {
		if errors.Is(err, service.ErrInvalidImage) {
			respondError(w, http.StatusBadRequest, "INVALID_IMAGE", err.Error())
			return
		}
		respondError(w, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}

	respondJSON(w, http.StatusCreated, map[string]interface{}{"data": img})
}

// ExportSingle handles GET /api/entries/:date/export
func (h *EntryHandler) ExportSingle(w http.ResponseWriter, r *http.Request) {
	date := chi.URLParam(r, "date")
	entry, err := h.entryService.GetByDate(r.Context(), date)
	if err != nil {
		if errors.Is(err, service.ErrNotFound) {
			respondError(w, http.StatusNotFound, "NOT_FOUND", err.Error())
			return
		}
		respondError(w, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}

	filename := strings.ReplaceAll(entry.Date, "-", "") + ".txt"
	w.Header().Set("Content-Disposition", mime.FormatMediaType("attachment", map[string]string{"filename": filename}))
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	if _, err := w.Write([]byte(entry.Body)); err != nil {
		slog.Error("failed to write export response", "error", err)
	}
}
