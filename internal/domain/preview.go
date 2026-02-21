package domain

import (
	"strings"
	"unicode/utf8"
)

const previewLength = 100

// GeneratePreview returns up to 100 runes of trimmed body text.
func GeneratePreview(body string) string {
	body = strings.TrimSpace(body)
	if utf8.RuneCountInString(body) <= previewLength {
		return body
	}
	runes := []rune(body)
	return string(runes[:previewLength]) + "..."
}
