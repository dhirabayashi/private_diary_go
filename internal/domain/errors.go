package domain

import "errors"

var (
	ErrInvalidDateFormat = errors.New("invalid date format")
	ErrFutureDate        = errors.New("cannot post for a future date")
	ErrInvalidFilename   = errors.New("invalid import filename")
)
