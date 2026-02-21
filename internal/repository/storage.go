package repository

import "io"

// Storage abstracts local file storage for images.
type Storage interface {
	Save(filename string, r io.Reader) error
	Delete(filename string) error
	Open(filename string) (io.ReadCloser, error)
}
