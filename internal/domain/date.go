package domain

import "time"

// JST は日本標準時（UTC+9）。tzdata 不要の固定オフセットで定義する。
var JST = time.FixedZone("JST", 9*60*60)

// ParseEntryDate validates a "2006-01-02" date string and rejects future dates.
// now は呼び出し元が JST に変換した時刻を渡すこと。
func ParseEntryDate(s string, now time.Time) (time.Time, error) {
	t, err := time.Parse("2006-01-02", s)
	if err != nil {
		return time.Time{}, ErrInvalidDateFormat
	}
	// now のタイムゾーンで「今日」の日付文字列と比較する。
	// Truncate(24h) は UTC 基準になるため使わない。
	today := now.Format("2006-01-02")
	if s > today {
		return time.Time{}, ErrFutureDate
	}
	return t, nil
}
