package server

import (
	"context"
	"errors"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5"

	"game-nexus/internal/auth"
)

const (
	sessionTTL     = 30 * 24 * time.Hour
	sessionRefresh = 12 * time.Hour // renew the session at most this often
)

type User struct {
	ID          int64     `json:"id"`
	Email       string    `json:"email"`
	DisplayName string    `json:"displayName"`
	Verified    bool      `json:"verified"`
	CreatedAt   time.Time `json:"createdAt"`
}

const userColumns = `u.id, u.email::text, u.display_name::text, u.email_verified_at IS NOT NULL, u.created_at`

func scanUser(row pgx.Row) (*User, error) {
	var u User
	if err := row.Scan(&u.ID, &u.Email, &u.DisplayName, &u.Verified, &u.CreatedAt); err != nil {
		return nil, err
	}
	return &u, nil
}

func (s *Server) cookieName() string {
	if s.secureCookies() {
		return "__Host-nexus" // only ever set over HTTPS, for this host, on path /
	}
	return "nexus"
}

func (s *Server) setCookie(w http.ResponseWriter, token string, expires time.Time) {
	c := &http.Cookie{
		Name:     s.cookieName(),
		Value:    token,
		Path:     "/",
		Expires:  expires,
		HttpOnly: true,
		Secure:   s.secureCookies(),
		SameSite: http.SameSiteLaxMode,
	}
	if token == "" {
		c.MaxAge = -1
	}
	http.SetCookie(w, c)
}

// startSession signs the user in on this browser.
func (s *Server) startSession(ctx context.Context, w http.ResponseWriter, r *http.Request, db execer, userID int64) error {
	token, hash, err := auth.NewToken()
	if err != nil {
		return err
	}
	expires := time.Now().Add(sessionTTL)
	ua := r.UserAgent()
	if len(ua) > 300 {
		ua = ua[:300]
	}
	_, err = db.Exec(ctx,
		`INSERT INTO sessions (token_hash, user_id, expires_at, user_agent) VALUES ($1, $2, $3, $4)`,
		hash, userID, expires, ua)
	if err != nil {
		return err
	}
	s.setCookie(w, token, expires)
	return nil
}

// sessionHash is the stored hash of this request's session cookie, or nil.
func (s *Server) sessionHash(r *http.Request) []byte {
	c, err := r.Cookie(s.cookieName())
	if err != nil || c.Value == "" || len(c.Value) > 100 {
		return nil
	}
	return auth.HashToken(c.Value)
}

// currentUser is the signed-in user, or nil for a guest. A session in use is kept
// alive for another 30 days.
func (s *Server) currentUser(w http.ResponseWriter, r *http.Request) (*User, error) {
	hash := s.sessionHash(r)
	if hash == nil {
		return nil, nil
	}
	var lastSeen time.Time
	var u User
	err := s.db.QueryRow(r.Context(),
		`SELECT `+userColumns+`, s.last_seen_at
		   FROM sessions s JOIN users u ON u.id = s.user_id
		  WHERE s.token_hash = $1 AND s.expires_at > now()`, hash).
		Scan(&u.ID, &u.Email, &u.DisplayName, &u.Verified, &u.CreatedAt, &lastSeen)
	if errors.Is(err, pgx.ErrNoRows) {
		s.setCookie(w, "", time.Time{})
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if time.Since(lastSeen) > sessionRefresh {
		expires := time.Now().Add(sessionTTL)
		if _, err := s.db.Exec(r.Context(),
			`UPDATE sessions SET last_seen_at = now(), expires_at = $2 WHERE token_hash = $1`, hash, expires); err == nil {
			c, _ := r.Cookie(s.cookieName())
			s.setCookie(w, c.Value, expires)
		}
	}
	return &u, nil
}

// requireUser is currentUser for calls that need an account. On nil it has
// already answered.
func (s *Server) requireUser(w http.ResponseWriter, r *http.Request) *User {
	u, err := s.currentUser(w, r)
	if err != nil {
		failInternal(w, "session", err)
		return nil
	}
	if u == nil {
		fail(w, http.StatusUnauthorized, "Sign in first.")
		return nil
	}
	return u
}
