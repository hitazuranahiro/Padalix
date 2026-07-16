package platform

import (
	"context"
	"log/slog"
	"net/http"
	"regexp"
	"strings"
	"time"
)

const correlationIDKey contextKey = "correlation_id"

var correlationIDPattern = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$`)

type responseStatusWriter struct {
	http.ResponseWriter
	status int
}

func (w *responseStatusWriter) WriteHeader(status int) {
	if w.status != 0 {
		return
	}
	w.status = status
	w.ResponseWriter.WriteHeader(status)
}

func (w *responseStatusWriter) Write(body []byte) (int, error) {
	if w.status == 0 {
		w.WriteHeader(http.StatusOK)
	}
	return w.ResponseWriter.Write(body)
}

func requestCorrelationID(r *http.Request) string {
	supplied := strings.TrimSpace(r.Header.Get("X-Correlation-ID"))
	if correlationIDPattern.MatchString(supplied) {
		return supplied
	}
	return newID()
}

func currentCorrelationID(ctx context.Context) string {
	correlationID, _ := ctx.Value(correlationIDKey).(string)
	return correlationID
}

func withHTTPBoundary(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		startedAt := time.Now()
		correlationID := requestCorrelationID(r)
		r.Header.Set("X-Correlation-ID", correlationID)
		r = r.WithContext(context.WithValue(r.Context(), correlationIDKey, correlationID))

		headers := w.Header()
		headers.Set("Cache-Control", "no-store")
		headers.Set("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'; sandbox")
		headers.Set("Content-Type", "application/json")
		headers.Set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()")
		headers.Set("Referrer-Policy", "no-referrer")
		headers.Set("Strict-Transport-Security", "max-age=31536000")
		headers.Set("X-Content-Type-Options", "nosniff")
		headers.Set("X-Correlation-ID", correlationID)
		headers.Set("X-Frame-Options", "DENY")
		headers.Set("X-Permitted-Cross-Domain-Policies", "none")

		writer := &responseStatusWriter{ResponseWriter: w}
		next.ServeHTTP(writer, r)
		status := writer.status
		if status == 0 {
			status = http.StatusOK
		}
		slog.Info("http_request",
			"correlation_id", correlationID,
			"method", r.Method,
			"path", r.URL.Path,
			"status", status,
			"duration_ms", time.Since(startedAt).Milliseconds(),
		)
	})
}
