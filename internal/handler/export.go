package handler

import (
	"bytes"
	"log/slog"
	"mime"
	"net/http"
	"strconv"

	"private_diary/internal/service"
)

type ExportHandler struct {
	exportService service.ExportService
}

func NewExportHandler(es service.ExportService) *ExportHandler {
	return &ExportHandler{exportService: es}
}

func (h *ExportHandler) Export(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	from := q.Get("from")
	to := q.Get("to")

	var buf bytes.Buffer
	zipName, err := h.exportService.Export(r.Context(), &buf, from, to)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/zip")
	w.Header().Set("Content-Disposition", mime.FormatMediaType("attachment", map[string]string{"filename": zipName}))
	w.Header().Set("Content-Length", strconv.Itoa(buf.Len()))
	if _, err := w.Write(buf.Bytes()); err != nil {
		slog.Error("failed to write zip response", "error", err)
	}
}
