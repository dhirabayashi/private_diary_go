package domain_test

import (
	"testing"

	"github.com/stretchr/testify/assert"

	"private_diary/internal/domain"
)

func TestParseImportFilename(t *testing.T) {
	tests := []struct {
		input   string
		want    string
		wantErr bool
	}{
		{"20240315.txt", "2024-03-15", false},
		{"20241231.txt", "2024-12-31", false},
		{"20240101.txt", "2024-01-01", false},
		// 異常系
		{"invalid.txt", "", true},
		{"2024031.txt", "", true},  // 桁数不足
		{"20241301.txt", "", true}, // 13月
		{"20240132.txt", "", true}, // 32日
		{"20240315", "", true},     // 拡張子なし
		{"20240315.csv", "", true}, // .csv
		{"", "", true},             // 空文字
	}

	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			got, err := domain.ParseImportFilename(tt.input)
			if tt.wantErr {
				assert.ErrorIs(t, err, domain.ErrInvalidFilename)
				assert.Empty(t, got)
			} else {
				assert.NoError(t, err)
				assert.Equal(t, tt.want, got)
			}
		})
	}
}
