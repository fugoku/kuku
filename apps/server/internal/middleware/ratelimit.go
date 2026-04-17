package middleware

import (
	"log/slog"
	"net/http"
	"sync"
	"time"

	"golang.org/x/time/rate"

	"github.com/kuku-mom/kuku/packages/contract/gen/go/kuku/auth/v1/authv1connect"
)

// rateLimitConfig is the token-bucket shape applied per (IP + endpoint).
// `rps` is the long-term refill rate; `burst` is how many calls a single IP
// may make back-to-back before throttling kicks in.
type rateLimitConfig struct {
	rps   rate.Limit
	burst int
}

// endpointRateLimits caps abuse on the public auth endpoints. Picked to give
// honest users headroom for typos / refresh storms while making automated
// brute-force / OTP-spam expensive enough to surface in logs before
// landing.
//
// Add new entries when introducing a public endpoint. Endpoints not listed
// here pass through with no rate limit applied.
var endpointRateLimits = map[string]rateLimitConfig{
	// Email-sending endpoints: tightest limit. Each call costs an SMTP send
	// and an OTP slot for the target email — cheap for an attacker to spam,
	// expensive for us.
	authv1connect.AuthServiceEmailAuthProcedure:   {rps: rate.Every(time.Hour / 5), burst: 5},
	authv1connect.AuthServiceEmailResendProcedure: {rps: rate.Every(time.Hour / 5), burst: 5},
	// Verify: brute-force needs many attempts. 30/hour with burst 5 lets a
	// honest user fix typos quickly while capping the search space an
	// attacker covers before being throttled (out of a 6-digit / 10^6 space).
	authv1connect.AuthServiceEmailVerifyProcedure: {rps: rate.Every(time.Hour / 30), burst: 5},
	// Desktop OAuth flow: less abusable but still public.
	authv1connect.AuthServiceDesktopAuthURLProcedure:       {rps: rate.Every(time.Minute), burst: 10},
	authv1connect.AuthServiceExchangeDesktopTokenProcedure: {rps: rate.Every(time.Hour / 30), burst: 5},
	authv1connect.AuthServiceRefreshDesktopTokenProcedure:  {rps: rate.Every(time.Minute), burst: 10},
	authv1connect.AuthServiceGoogleAuthURLProcedure:        {rps: rate.Every(time.Minute), burst: 10},
	authv1connect.AuthServiceGithubAuthURLProcedure:        {rps: rate.Every(time.Minute), burst: 10},
}

type limiterEntry struct {
	limiter  *rate.Limiter
	lastSeen time.Time
}

// rateLimiterRegistry holds one *rate.Limiter per (IP + endpoint) key. The
// cleanup goroutine evicts entries unused for an hour so memory stays
// bounded under sparse-IP scrape patterns.
type rateLimiterRegistry struct {
	mu      sync.Mutex
	entries map[string]*limiterEntry
}

func newRateLimiterRegistry() *rateLimiterRegistry {
	return &rateLimiterRegistry{
		entries: make(map[string]*limiterEntry),
	}
}

func (r *rateLimiterRegistry) get(key string, cfg rateLimitConfig) *rate.Limiter {
	r.mu.Lock()
	defer r.mu.Unlock()
	e, ok := r.entries[key]
	if !ok {
		e = &limiterEntry{limiter: rate.NewLimiter(cfg.rps, cfg.burst)}
		r.entries[key] = e
	}
	e.lastSeen = time.Now()
	return e.limiter
}

func (r *rateLimiterRegistry) cleanup(maxAge time.Duration) {
	r.mu.Lock()
	defer r.mu.Unlock()
	threshold := time.Now().Add(-maxAge)
	for key, e := range r.entries {
		if e.lastSeen.Before(threshold) {
			delete(r.entries, key)
		}
	}
}

// RateLimit applies per-(IP + endpoint) limits to public auth endpoints.
// Requests to paths missing from `endpointRateLimits` pass through. When a
// limit is exceeded the response is a Connect-protocol-shaped 429 so
// generated clients surface it as `CodeResourceExhausted` rather than an
// opaque transport error.
//
// CORS preflight OPTIONS short-circuits in `CORS` before reaching this
// middleware, so legitimate browser preflights never count against the
// limiter. Background cleanup runs every 10m to bound memory.
func RateLimit(log *slog.Logger) func(http.Handler) http.Handler {
	registry := newRateLimiterRegistry()
	go func() {
		ticker := time.NewTicker(10 * time.Minute)
		defer ticker.Stop()
		for range ticker.C {
			registry.cleanup(time.Hour)
		}
	}()

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			cfg, ok := endpointRateLimits[r.URL.Path]
			if !ok {
				next.ServeHTTP(w, r)
				return
			}
			ip := clientIP(r)
			limiter := registry.get(ip+"|"+r.URL.Path, cfg)
			if !limiter.Allow() {
				log.Warn("rate limit exceeded", "ip", ip, "path", r.URL.Path)
				w.Header().Set("Content-Type", "application/json")
				w.Header().Set("Retry-After", "60")
				w.WriteHeader(http.StatusTooManyRequests)
				_, _ = w.Write([]byte(`{"code":"resource_exhausted","message":"rate limit exceeded"}`))
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
