package handler_test

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"

	"private_diary/internal/handler"
)

func TestExportHandler_Export(t *testing.T) {
	exportSvc := &mockExportService{
		exportFn: func(_ context.Context, w io.Writer, from, to string) (string, error) {
			_, _ = w.Write([]byte("PK")) // ZIP magic bytes
			return "diary_export_20240101_20241231.zip", nil
		},
	}
	h := handler.NewExportHandler(exportSvc)

	req := httptest.NewRequest(http.MethodGet, "/api/export?from=2024-01-01&to=2024-12-31", nil)
	rec := httptest.NewRecorder()
	h.Export(rec, req)

	assert.Equal(t, http.StatusOK, rec.Code)
	assert.Equal(t, "application/zip", rec.Header().Get("Content-Type"))
	assert.Contains(t, rec.Header().Get("Content-Disposition"), "diary_export_20240101_20241231.zip")
	assert.Equal(t, "PK", rec.Body.String())
}
