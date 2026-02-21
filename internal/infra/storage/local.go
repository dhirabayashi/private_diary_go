package storage

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
)

// LocalStorage saves image files to a local directory.
type LocalStorage struct {
	dir string
}

func NewLocalStorage(dir string) *LocalStorage {
	return &LocalStorage{dir: dir}
}

func (s *LocalStorage) Save(filename string, r io.Reader) error {
	if err := os.MkdirAll(s.dir, 0755); err != nil {
		return fmt.Errorf("create storage dir: %w", err)
	}
	f, err := os.Create(filepath.Join(s.dir, filename))
	if err != nil {
		return err
	}
	defer f.Close()
	_, err = io.Copy(f, r)
	return err
}

func (s *LocalStorage) Delete(filename string) error {
	err := os.Remove(filepath.Join(s.dir, filename))
	if os.IsNotExist(err) {
		return nil
	}
	return err
}

func (s *LocalStorage) Open(filename string) (io.ReadCloser, error) {
	return os.Open(filepath.Join(s.dir, filename))
}
