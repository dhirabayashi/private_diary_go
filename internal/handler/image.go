package handler

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"

	"private_diary/internal/service"
)

type ImageHandler struct {
	imageService service.ImageService
}

func NewImageHandler(is service.ImageService) *ImageHandler {
	return &ImageHandler{imageService: is}
}

func (h *ImageHandler) Delete(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		respondError(w, http.StatusBadRequest, "INVALID_ID", "invalid image ID")
		return
	}

	if err := h.imageService.DeleteImage(r.Context(), id); err != nil {
		if errors.Is(err, service.ErrNotFound) {
			respondError(w, http.StatusNotFound, "NOT_FOUND", err.Error())
			return
		}
		respondError(w, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
