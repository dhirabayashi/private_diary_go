package model

import "time"

type Entry struct {
	ID        int64     `json:"id"`
	Date      string    `json:"entry_date"`
	Body      string    `json:"body"`
	Preview   string    `json:"preview,omitempty"`
	Images    []*Image  `json:"images,omitempty"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

type ListParams struct {
	Page     int
	PageSize int
	Query    string
	From     string
	To       string
}
