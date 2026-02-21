package handler_test

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"private_diary/internal/handler"
	"private_diary/internal/model"
	"private_diary/internal/service"
)

func makeMultipartFile(t *testing.T, fieldName, filename, content string) (*bytes.Buffer, string) {
	t.Helper()
	var buf bytes.Buffer
	w := multipart.NewWriter(&buf)
	fw, err := w.CreateFormFile(fieldName, filename)
	require.NoError(t, err)
	_, err = io.WriteString(fw, content)
	require.NoError(t, err)
	w.Close()
	return &buf, w.FormDataContentType()
}

func TestImportHandler_Import_Success(t *testing.T) {
	importSvc := &mockImportService{
		importFn: func(_ context.Context, filename string, r io.Reader, overwrite bool) (*model.Entry, bool, error) {
			return &model.Entry{ID: 1, Date: "2024-03-15", Body: "本文"}, false, nil
		},
	}
	h := handler.NewImportHandler(importSvc)

	buf, ct := makeMultipartFile(t, "file", "20240315.txt", "本文")
	req := httptest.NewRequest(http.MethodPost, "/api/import", buf)
	req.Header.Set("Content-Type", ct)
	rec := httptest.NewRecorder()
	h.Import(rec, req)

	assert.Equal(t, http.StatusOK, rec.Code)
}

func TestImportHandler_Import_InvalidFile(t *testing.T) {
	importSvc := &mockImportService{
		importFn: func(_ context.Context, filename string, r io.Reader, overwrite bool) (*model.Entry, bool, error) {
			return nil, false, service.ErrInvalidFile
		},
	}
	h := handler.NewImportHandler(importSvc)

	buf, ct := makeMultipartFile(t, "file", "invalid.txt", "本文")
	req := httptest.NewRequest(http.MethodPost, "/api/import", buf)
	req.Header.Set("Content-Type", ct)
	rec := httptest.NewRecorder()
	h.Import(rec, req)

	assert.Equal(t, http.StatusBadRequest, rec.Code)
}

func TestImportHandler_Import_AlreadyExists_ReturnsConflict(t *testing.T) {
	importSvc := &mockImportService{
		importFn: func(_ context.Context, filename string, r io.Reader, overwrite bool) (*model.Entry, bool, error) {
			return nil, true, nil
		},
	}
	h := handler.NewImportHandler(importSvc)

	buf, ct := makeMultipartFile(t, "file", "20240315.txt", "本文")
	req := httptest.NewRequest(http.MethodPost, "/api/import", buf)
	req.Header.Set("Content-Type", ct)
	rec := httptest.NewRecorder()
	h.Import(rec, req)

	assert.Equal(t, http.StatusConflict, rec.Code)
	var resp map[string]interface{}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
	errObj := resp["error"].(map[string]interface{})
	assert.Equal(t, "ALREADY_EXISTS", errObj["code"])
}
