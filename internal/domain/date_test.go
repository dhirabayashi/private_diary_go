package domain_test

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"

	"private_diary/internal/domain"
)

func TestParseEntryDate(t *testing.T) {
	// JST で 2024-03-15 12:00 を「現在」とする
	now := time.Date(2024, 3, 15, 12, 0, 0, 0, domain.JST)

	tests := []struct {
		name    string
		input   string
		wantErr error
	}{
		{"正常: 当日", "2024-03-15", nil},
		{"正常: 過去日", "2024-01-01", nil},
		{"正常: 一日前", "2024-03-14", nil},
		{"異常: 翌日（未来日）", "2024-03-16", domain.ErrFutureDate},
		{"異常: 遠い未来", "2099-12-31", domain.ErrFutureDate},
		{"異常: スラッシュ形式", "2024/03/15", domain.ErrInvalidDateFormat},
		{"異常: yyyyMMdd形式", "20240315", domain.ErrInvalidDateFormat},
		{"異常: 空文字", "", domain.ErrInvalidDateFormat},
		{"異常: 不完全な日付", "2024-03", domain.ErrInvalidDateFormat},
		{"異常: 文字列", "not-a-date", domain.ErrInvalidDateFormat},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := domain.ParseEntryDate(tt.input, now)
			if tt.wantErr != nil {
				assert.ErrorIs(t, err, tt.wantErr)
				assert.Zero(t, got)
			} else {
				assert.NoError(t, err)
				assert.NotZero(t, got)
			}
		})
	}
}

// TestParseEntryDate_JSTEdge は JST 0:00〜8:59（UTC では前日）のエッジケースを検証する。
// この時間帯、UTC 基準の Truncate(24h) を使うと JST の「今日」が未来日と誤判定される。
func TestParseEntryDate_JSTEdge(t *testing.T) {
	// JST 2024-03-15 00:30 ＝ UTC 2024-03-14 15:30
	nowJST := time.Date(2024, 3, 15, 0, 30, 0, 0, domain.JST)

	// JST では今日 (2024-03-15) なのでエラーにならないこと
	_, err := domain.ParseEntryDate("2024-03-15", nowJST)
	assert.NoError(t, err, "JST 0:30 に JST 当日の日付を投稿できること")

	// 翌日 (JST) はエラー
	_, err = domain.ParseEntryDate("2024-03-16", nowJST)
	assert.ErrorIs(t, err, domain.ErrFutureDate, "JST 翌日はエラーになること")
}
