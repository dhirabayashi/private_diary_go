package model

import "time"

type Image struct {
	ID           int64     `json:"id"`
	EntryID      int64     `json:"entry_id"`
	Filename     string    `json:"filename"`
	OriginalName string    `json:"original_name"`
	Order        int       `json:"order"`
	CreatedAt    time.Time `json:"created_at"`
}
