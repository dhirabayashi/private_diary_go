package domain

import (
	"strings"
	"time"
)

// ParseImportFilename parses "20240315.txt" and returns "2024-03-15".
func ParseImportFilename(name string) (string, error) {
	if !strings.HasSuffix(name, ".txt") {
		return "", ErrInvalidFilename
	}
	base := strings.TrimSuffix(name, ".txt")
	t, err := time.Parse("20060102", base)
	if err != nil {
		return "", ErrInvalidFilename
	}
	return t.Format("2006-01-02"), nil
}
