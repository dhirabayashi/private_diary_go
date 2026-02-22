package handler_test

import (
	"archive/zip"
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

func makeZipMultipart(t *testing.T, files map[string]string) (*bytes.Buffer, string) {
	t.Helper()
	var zipBuf bytes.Buffer
	zw := zip.NewWriter(&zipBuf)
	for name, content := range files {
		fw, err := zw.Create(name)
		require.NoError(t, err)
		_, err = io.WriteString(fw, content)
		require.NoError(t, err)
	}
	require.NoError(t, zw.Close())

	var buf bytes.Buffer
	mw := multipart.NewWriter(&buf)
	fw, err := mw.CreateFormFile("file", "import.zip")
	require.NoError(t, err)
	_, err = fw.Write(zipBuf.Bytes())
	require.NoError(t, err)
	mw.Close()
	return &buf, mw.FormDataContentType()
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
			return nil, false, service.ErrInvalidFilename
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

func TestImportHandler_ImportZip_Success(t *testing.T) {
	importSvc := &mockImportService{
		importZipFn: func(_ context.Context, r io.ReaderAt, size int64) (*service.ZipImportResult, error) {
			return &service.ZipImportResult{
				Imported: 2,
				Skipped:  []service.ZipSkippedEntry{{Date: "2024-01-15", Reason: "already_exists"}},
			}, nil
		},
	}
	h := handler.NewImportHandler(importSvc)

	buf, ct := makeZipMultipart(t, map[string]string{
		"20240101.txt": "元旦",
		"20240115.txt": "既存",
		"20240201.txt": "節分",
	})
	req := httptest.NewRequest(http.MethodPost, "/api/import/zip", buf)
	req.Header.Set("Content-Type", ct)
	rec := httptest.NewRecorder()
	h.ImportZip(rec, req)

	assert.Equal(t, http.StatusOK, rec.Code)
	var resp map[string]interface{}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
	data := resp["data"].(map[string]interface{})
	assert.Equal(t, float64(2), data["imported"])
	skipped := data["skipped"].([]interface{})
	require.Len(t, skipped, 1)
	assert.Equal(t, "2024-01-15", skipped[0].(map[string]interface{})["date"])
}

func TestImportHandler_ImportZip_NotZip(t *testing.T) {
	importSvc := &mockImportService{}
	h := handler.NewImportHandler(importSvc)

	buf, ct := makeMultipartFile(t, "file", "20240315.txt", "本文")
	req := httptest.NewRequest(http.MethodPost, "/api/import/zip", buf)
	req.Header.Set("Content-Type", ct)
	rec := httptest.NewRecorder()
	h.ImportZip(rec, req)

	assert.Equal(t, http.StatusBadRequest, rec.Code)
	var resp map[string]interface{}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
	errObj := resp["error"].(map[string]interface{})
	assert.Equal(t, "INVALID_FILE", errObj["code"])
}

func TestImportHandler_ImportZip_NoFile(t *testing.T) {
	importSvc := &mockImportService{}
	h := handler.NewImportHandler(importSvc)

	var buf bytes.Buffer
	mw := multipart.NewWriter(&buf)
	mw.Close()
	req := httptest.NewRequest(http.MethodPost, "/api/import/zip", &buf)
	req.Header.Set("Content-Type", mw.FormDataContentType())
	rec := httptest.NewRecorder()
	h.ImportZip(rec, req)

	assert.Equal(t, http.StatusBadRequest, rec.Code)
}
