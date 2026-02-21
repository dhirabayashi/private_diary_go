package handler_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"private_diary/internal/handler"
	"private_diary/internal/model"
	"private_diary/internal/service"
)

func makeEntry(date, body string) *model.Entry {
	return &model.Entry{ID: 1, Date: date, Body: body, CreatedAt: time.Now(), UpdatedAt: time.Now()}
}

func noImages() *mockImageService {
	return &mockImageService{
		getImagesForEntry: func(_ context.Context, _ int64) ([]*model.Image, error) {
			return nil, nil
		},
	}
}

// withChiParam wraps a handler with chi context so URL params are accessible.
func withChiParam(h http.HandlerFunc, key, value string) http.Handler {
	r := chi.NewRouter()
	r.Get("/{"+key+"}", h)
	r.Put("/{"+key+"}", h)
	r.Delete("/{"+key+"}", h)
	_ = key
	_ = value
	return r
}

func TestEntryHandler_List(t *testing.T) {
	entries := []*model.Entry{makeEntry("2024-03-15", "本文")}
	esSvc := &mockEntryService{
		list: func(_ context.Context, p model.ListParams) ([]*model.Entry, int, error) {
			return entries, 1, nil
		},
	}
	h := handler.NewEntryHandler(esSvc, noImages())

	req := httptest.NewRequest(http.MethodGet, "/api/entries", nil)
	rec := httptest.NewRecorder()
	h.List(rec, req)

	assert.Equal(t, http.StatusOK, rec.Code)
	var resp map[string]interface{}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
	data := resp["data"].(map[string]interface{})
	assert.EqualValues(t, 1, data["total"])
}

func TestEntryHandler_Create_Success(t *testing.T) {
	esSvc := &mockEntryService{
		create: func(_ context.Context, date, body string) (*model.Entry, error) {
			return makeEntry(date, body), nil
		},
	}
	h := handler.NewEntryHandler(esSvc, noImages())

	body, _ := json.Marshal(map[string]string{"date": "2024-03-15", "body": "本文"})
	req := httptest.NewRequest(http.MethodPost, "/api/entries", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	h.Create(rec, req)

	assert.Equal(t, http.StatusCreated, rec.Code)
}

func TestEntryHandler_Create_FutureDate(t *testing.T) {
	esSvc := &mockEntryService{
		create: func(_ context.Context, date, body string) (*model.Entry, error) {
			return nil, service.ErrFutureDate
		},
	}
	h := handler.NewEntryHandler(esSvc, noImages())

	body, _ := json.Marshal(map[string]string{"date": "2099-01-01", "body": "本文"})
	req := httptest.NewRequest(http.MethodPost, "/api/entries", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	h.Create(rec, req)

	assert.Equal(t, http.StatusBadRequest, rec.Code)
	var resp map[string]interface{}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
	errObj := resp["error"].(map[string]interface{})
	assert.Equal(t, "FUTURE_DATE", errObj["code"])
}

func TestEntryHandler_Create_DuplicateDate(t *testing.T) {
	esSvc := &mockEntryService{
		create: func(_ context.Context, date, body string) (*model.Entry, error) {
			return nil, service.ErrDuplicateDate
		},
	}
	h := handler.NewEntryHandler(esSvc, noImages())

	body, _ := json.Marshal(map[string]string{"date": "2024-03-15", "body": "本文"})
	req := httptest.NewRequest(http.MethodPost, "/api/entries", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	h.Create(rec, req)

	assert.Equal(t, http.StatusConflict, rec.Code)
}

func TestEntryHandler_GetByDate(t *testing.T) {
	esSvc := &mockEntryService{
		getByDate: func(_ context.Context, date string) (*model.Entry, error) {
			return makeEntry(date, "本文"), nil
		},
	}
	h := handler.NewEntryHandler(esSvc, noImages())

	// Use chi router so URL param is set
	r := chi.NewRouter()
	r.Get("/{date}", h.GetByDate)

	req := httptest.NewRequest(http.MethodGet, "/2024-03-15", nil)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	assert.Equal(t, http.StatusOK, rec.Code)
	var resp map[string]interface{}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
	data := resp["data"].(map[string]interface{})
	assert.Equal(t, "2024-03-15", data["entry_date"])
}

func TestEntryHandler_GetByDate_NotFound(t *testing.T) {
	esSvc := &mockEntryService{
		getByDate: func(_ context.Context, date string) (*model.Entry, error) {
			return nil, service.ErrNotFound
		},
	}
	h := handler.NewEntryHandler(esSvc, noImages())

	r := chi.NewRouter()
	r.Get("/{date}", h.GetByDate)

	req := httptest.NewRequest(http.MethodGet, "/2024-01-01", nil)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	assert.Equal(t, http.StatusNotFound, rec.Code)
}

func TestEntryHandler_Delete(t *testing.T) {
	esSvc := &mockEntryService{
		delete: func(_ context.Context, date string) error { return nil },
	}
	h := handler.NewEntryHandler(esSvc, noImages())

	r := chi.NewRouter()
	r.Delete("/{date}", h.Delete)

	req := httptest.NewRequest(http.MethodDelete, "/2024-03-15", nil)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	assert.Equal(t, http.StatusNoContent, rec.Code)
}

func TestEntryHandler_Delete_NotFound(t *testing.T) {
	esSvc := &mockEntryService{
		delete: func(_ context.Context, date string) error { return service.ErrNotFound },
	}
	h := handler.NewEntryHandler(esSvc, noImages())

	r := chi.NewRouter()
	r.Delete("/{date}", h.Delete)

	req := httptest.NewRequest(http.MethodDelete, "/2024-01-01", nil)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	assert.Equal(t, http.StatusNotFound, rec.Code)
}
