package domain

import "regexp"

var urlRegex = regexp.MustCompile(`https?://[^\s<>"{}|\\^\[\]` + "`" + `]+`)

// URLSpan represents a URL found in text with its byte positions.
type URLSpan struct {
	Start int
	End   int
	URL   string
}

// FindURLs returns all URL spans found in the given text.
func FindURLs(text string) []URLSpan {
	matches := urlRegex.FindAllStringIndex(text, -1)
	spans := make([]URLSpan, 0, len(matches))
	for _, m := range matches {
		spans = append(spans, URLSpan{
			Start: m[0],
			End:   m[1],
			URL:   text[m[0]:m[1]],
		})
	}
	return spans
}
