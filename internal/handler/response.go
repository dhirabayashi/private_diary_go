package handler

import (
	"encoding/json"
	"log/slog"
	"net/http"

	"private_diary/internal/service"
)

func respondJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(data); err != nil {
		slog.Error("failed to encode JSON response", "error", err)
	}
}

func respondError(w http.ResponseWriter, status int, code, message string) {
	respondJSON(w, status, map[string]interface{}{
		"error": map[string]string{
			"code":    code,
			"message": message,
		},
	})
}

// respondVersionConflict は楽観ロックの競合（409 VERSION_CONFLICT）を返す。
// current_version を含めるため、message/code のみの respondError では表現できない。
func respondVersionConflict(w http.ResponseWriter, vce *service.VersionConflictError) {
	respondJSON(w, http.StatusConflict, map[string]interface{}{
		"error": map[string]interface{}{
			"code":            "VERSION_CONFLICT",
			"message":         vce.Error(),
			"current_version": vce.CurrentVersion,
		},
	})
}
