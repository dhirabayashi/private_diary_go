package handler

import (
	"errors"
	"net/http"
	"strings"

	"private_diary/internal/service"
)

type zipSkippedResponse struct {
	Date   string `json:"date"`
	Reason string `json:"reason"`
}

type zipImportResponse struct {
	Imported int                  `json:"imported"`
	Skipped  []zipSkippedResponse `json:"skipped"`
}

type ImportHandler struct {
	importService service.ImportService
}

func NewImportHandler(is service.ImportService) *ImportHandler {
	return &ImportHandler{importService: is}
}

func (h *ImportHandler) Import(w http.ResponseWriter, r *http.Request) {
	if err := r.ParseMultipartForm(10 << 20); err != nil {
		respondError(w, http.StatusBadRequest, "INVALID_REQUEST", "failed to parse form")
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		respondError(w, http.StatusBadRequest, "INVALID_REQUEST", "file field required")
		return
	}
	defer file.Close()

	overwrite := r.FormValue("overwrite") == "true"

	entry, needsConfirm, err := h.importService.Import(r.Context(), header.Filename, file, overwrite)
	if err != nil {
		if errors.Is(err, service.ErrInvalidFilename) {
			respondError(w, http.StatusBadRequest, "INVALID_FILE", err.Error())
			return
		}
		respondError(w, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}

	if needsConfirm {
		respondJSON(w, http.StatusConflict, map[string]interface{}{
			"error": map[string]string{
				"code":    "ALREADY_EXISTS",
				"message": "その日付にはすでに日記が存在します。上書きしますか？",
			},
		})
		return
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{"data": entry})
}

func (h *ImportHandler) ImportZip(w http.ResponseWriter, r *http.Request) {
	if err := r.ParseMultipartForm(100 << 20); err != nil {
		respondError(w, http.StatusBadRequest, "INVALID_REQUEST", "failed to parse form")
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		respondError(w, http.StatusBadRequest, "INVALID_REQUEST", "file field required")
		return
	}
	defer file.Close()

	if !strings.HasSuffix(strings.ToLower(header.Filename), ".zip") {
		respondError(w, http.StatusBadRequest, "INVALID_FILE", "zip ファイルのみ対応しています")
		return
	}

	result, err := h.importService.ImportZip(r.Context(), file, header.Size)
	if err != nil {
		if errors.Is(err, service.ErrInvalidZip) {
			respondError(w, http.StatusBadRequest, "INVALID_ZIP", err.Error())
			return
		}
		respondError(w, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}

	resp := zipImportResponse{
		Imported: result.Imported,
		Skipped:  make([]zipSkippedResponse, len(result.Skipped)),
	}
	for i, s := range result.Skipped {
		resp.Skipped[i] = zipSkippedResponse{Date: s.Date, Reason: s.Reason}
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{"data": resp})
}
