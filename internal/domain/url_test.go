package domain_test

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"private_diary/internal/domain"
)

func TestFindURLs(t *testing.T) {
	tests := []struct {
		name      string
		input     string
		wantURLs  []string
		wantCount int
	}{
		{
			name:      "URLなし",
			input:     "普通のテキスト",
			wantCount: 0,
		},
		{
			name:      "http URL 1件",
			input:     "詳細は http://example.com を参照",
			wantURLs:  []string{"http://example.com"},
			wantCount: 1,
		},
		{
			name:      "https URL 1件",
			input:     "https://example.com/path?q=1 です",
			wantURLs:  []string{"https://example.com/path?q=1"},
			wantCount: 1,
		},
		{
			name:      "複数URL",
			input:     "https://a.com と https://b.com",
			wantURLs:  []string{"https://a.com", "https://b.com"},
			wantCount: 2,
		},
		{
			name:      "URLのみ",
			input:     "https://example.com",
			wantURLs:  []string{"https://example.com"},
			wantCount: 1,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := domain.FindURLs(tt.input)
			require.Len(t, got, tt.wantCount)

			for i, want := range tt.wantURLs {
				assert.Equal(t, want, got[i].URL)
				// 位置がテキスト内のバイトオフセットと一致することを確認
				assert.Equal(t, want, tt.input[got[i].Start:got[i].End])
			}
		})
	}
}
