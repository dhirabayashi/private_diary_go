package service

import "errors"

var (
	ErrFutureDate      = errors.New("未来日には投稿できません")
	ErrDuplicateDate   = errors.New("その日付にはすでに日記が存在します")
	ErrNotFound        = errors.New("日記が見つかりません")
	ErrInvalidDate     = errors.New("日付の形式が正しくありません")
	ErrInvalidFilename = errors.New("不正なファイル名です")
	ErrInvalidZip      = errors.New("ZIPファイルが読み込めません")
	ErrInvalidImage    = errors.New("対応していない画像形式です")
)
