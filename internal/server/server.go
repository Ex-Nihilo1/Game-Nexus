// Package server is the HTTP side of Game Nexus: the API and the game files.
package server

import (
	"context"
	"log"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"game-nexus/internal/auth"
)

type Config struct {
	// The site's public address, e.g. https://games.example.com: used in mailed
	// links and to check the Origin of requests. Empty in development, where the
	// request's own host is used.
	BaseURL string
	// Where the game files are (the web/ folder).
	WebRoot string
	// Behind a reverse proxy: take the client address from X-Real-IP.
	TrustProxy bool
}

type Server struct {
	cfg     Config
	db      *pgxpool.Pool
	mail    Mailer
	started time.Time

	signupLimit   *auth.Limiter // per IP
	loginIPLimit  *auth.Limiter // per IP
	loginLimit    *auth.Limiter // per email
	mailLimit     *auth.Limiter // per email address mailed to
	runLimit      *auth.Limiter // per user
	saveLimit     *auth.Limiter // per user
	tokenIPLimit  *auth.Limiter // per IP, for links from emails
	accountLimits *auth.Limiter // per user, for password checks on account changes
}

// Mailer sends one plain-text email. *mail.Sender is the real one.
type Mailer interface {
	Send(to, subject, body string) error
}

func New(cfg Config, db *pgxpool.Pool, mailer Mailer) *Server {
	cfg.BaseURL = strings.TrimRight(cfg.BaseURL, "/")
	return &Server{
		cfg:           cfg,
		db:            db,
		mail:          mailer,
		started:       time.Now(),
		signupLimit:   auth.NewLimiter(10*time.Minute, 5),
		loginIPLimit:  auth.NewLimiter(20*time.Second, 20),
		loginLimit:    auth.NewLimiter(time.Minute, 8),
		mailLimit:     auth.NewLimiter(5*time.Minute, 3),
		runLimit:      auth.NewLimiter(2*time.Second, 30),
		saveLimit:     auth.NewLimiter(time.Second, 60),
		tokenIPLimit:  auth.NewLimiter(10*time.Second, 20),
		accountLimits: auth.NewLimiter(time.Minute, 8),
	}
}

// Handler routes every request.
func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	api := func(pattern string, h http.HandlerFunc) { mux.Handle(pattern, h) }

	api("GET /api/health", s.health)

	api("POST /api/auth/signup", s.signup)
	api("POST /api/auth/login", s.login)
	api("POST /api/auth/logout", s.logout)
	api("POST /api/auth/logout-all", s.logoutAll)
	api("POST /api/auth/verify", s.verify)
	api("POST /api/auth/resend", s.resend)
	api("POST /api/auth/forgot", s.forgot)
	api("POST /api/auth/reset", s.reset)

	api("GET /api/me", s.me)
	api("PATCH /api/me", s.renameMe)
	api("POST /api/me/password", s.changePassword)
	api("POST /api/me/email", s.changeEmail)
	api("DELETE /api/me", s.deleteMe)

	api("GET /api/saves", s.listSaves)
	api("GET /api/saves/{key}", s.getSave)
	api("PUT /api/saves/{key}", s.putSave)

	api("POST /api/runs", s.startRun)
	api("POST /api/runs/{id}/finish", s.finishRun)

	api("GET /api/boards", s.listBoards)
	api("GET /api/boards/{game}", s.boardOptions)
	api("GET /api/boards/{game}/{board}", s.board)
	api("GET /api/profile/{name}", s.profile)

	api("/api/", func(w http.ResponseWriter, r *http.Request) { fail(w, http.StatusNotFound, "No such API call.") })
	mux.Handle("/", s.static())

	return s.guard(mux)
}

// guard adds the headers every response gets and the same-site check on changes.
func (s *Server) guard(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("Referrer-Policy", "same-origin")
		h.Set("X-Frame-Options", "DENY")
		if strings.HasPrefix(r.URL.Path, "/api/") {
			h.Set("Cache-Control", "no-store")
			if r.Method != http.MethodGet && r.Method != http.MethodHead {
				if r.Header.Get("X-Nexus") != "1" || !s.sameOrigin(r) {
					fail(w, http.StatusForbidden, "This request did not come from Game Nexus.")
					return
				}
			}
		}
		next.ServeHTTP(w, r)
	})
}

func (s *Server) sameOrigin(r *http.Request) bool {
	origin := r.Header.Get("Origin")
	if origin == "" {
		return true // same-origin GETs and some older browsers send none; X-Nexus still holds
	}
	if s.cfg.BaseURL != "" {
		return origin == s.cfg.BaseURL
	}
	u, err := url.Parse(origin)
	return err == nil && u.Host == r.Host
}

// baseURL is where mailed links point.
func (s *Server) baseURL(r *http.Request) string {
	if s.cfg.BaseURL != "" {
		return s.cfg.BaseURL
	}
	scheme := "http"
	if r.TLS != nil {
		scheme = "https"
	}
	return scheme + "://" + r.Host
}

func (s *Server) secureCookies() bool { return strings.HasPrefix(s.cfg.BaseURL, "https://") }

func (s *Server) clientIP(r *http.Request) string {
	if s.cfg.TrustProxy {
		if ip := r.Header.Get("X-Real-IP"); ip != "" {
			return ip
		}
	}
	host := r.RemoteAddr
	if i := strings.LastIndex(host, ":"); i >= 0 {
		host = host[:i]
	}
	return strings.Trim(host, "[]")
}

func (s *Server) health(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
	defer cancel()
	if err := s.db.Ping(ctx); err != nil {
		log.Printf("health: %v", err)
		fail(w, http.StatusServiceUnavailable, "The database is not answering.")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// Cleanup drops expired sessions, links and run tokens. main runs it every hour.
func (s *Server) Cleanup(ctx context.Context) {
	for _, q := range []string{
		`DELETE FROM sessions WHERE expires_at < now()`,
		`DELETE FROM email_tokens WHERE expires_at < now() - interval '1 day'`,
		`DELETE FROM runs WHERE finished_at IS NULL AND started_at < now() - interval '8 days'`,
	} {
		if _, err := s.db.Exec(ctx, q); err != nil {
			log.Printf("cleanup: %v", err)
		}
	}
}
