package domain_test

import (
	"strings"
	"testing"
	"unicode/utf8"

	"github.com/stretchr/testify/assert"

	"private_diary/internal/domain"
)

func TestGeneratePreview(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		wantFunc func(string) bool
	}{
		{
			name:     "短いテキスト（100文字以下）はそのまま返す",
			input:    "短い本文",
			wantFunc: func(s string) bool { return s == "短い本文" },
		},
		{
			name:     "前後の空白はトリムされる",
			input:    "  本文  ",
			wantFunc: func(s string) bool { return s == "本文" },
		},
		{
			name:     "100文字ちょうどはそのまま返す",
			input:    strings.Repeat("あ", 100),
			wantFunc: func(s string) bool { return utf8.RuneCountInString(s) == 100 && !strings.HasSuffix(s, "...") },
		},
		{
			name:     "101文字は100文字に切り詰めて...を付ける",
			input:    strings.Repeat("あ", 101),
			wantFunc: func(s string) bool { return strings.HasSuffix(s, "...") && utf8.RuneCountInString(s) == 103 },
		},
		{
			name:     "空文字は空文字を返す",
			input:    "",
			wantFunc: func(s string) bool { return s == "" },
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := domain.GeneratePreview(tt.input)
			assert.True(t, tt.wantFunc(got), "got: %q", got)
		})
	}
}
