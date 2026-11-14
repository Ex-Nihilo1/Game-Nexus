package server

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

// execer is a pool or a transaction.
type execer interface {
	Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error)
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

// How recent a sign-in must be to delete the account, so that a browser left
// signed in cannot delete it.
const recentSignIn = 10 * time.Minute

// Display names: 3 to 24 letters, digits, spaces, dots, dashes and underscores,
// starting with a letter or digit. Runs of spaces become one.
func cleanDisplayName(s string) (string, string) {
	s = strings.Join(strings.Fields(s), " ")
	n := utf8.RuneCountInString(s)
	if n < 3 || n > 24 {
		return "", "A display name is 3 to 24 characters long."
	}
	for i, r := range s {
		letterOrDigit := unicode.IsLetter(r) || unicode.IsDigit(r)
		if i == 0 && !letterOrDigit {
			return "", "A display name starts with a letter or a digit."
		}
		if !letterOrDigit && !strings.ContainsRune(" ._-", r) {
			return "", "A display name may use letters, digits, spaces, dots, dashes and underscores."
		}
	}
	return s, ""
}

func uniqueViolation(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23505"
}

func (s *Server) logout(w http.ResponseWriter, r *http.Request) {
	if hash := s.sessionHash(r); hash != nil {
		if _, err := s.db.Exec(r.Context(), `DELETE FROM sessions WHERE token_hash = $1`, hash); err != nil {
			failInternal(w, "logout", err)
			return
		}
	}
	s.setCookie(w, "", time.Time{})
	ok(w)
}

func (s *Server) logoutAll(w http.ResponseWriter, r *http.Request) {
	u := s.requireUser(w, r)
	if u == nil {
		return
	}
	if _, err := s.db.Exec(r.Context(), `DELETE FROM sessions WHERE user_id = $1`, u.ID); err != nil {
		failInternal(w, "logout-all", err)
		return
	}
	s.setCookie(w, "", time.Time{})
	ok(w)
}

func (s *Server) me(w http.ResponseWriter, r *http.Request) {
	u, err := s.currentUser(w, r)
	if err != nil {
		failInternal(w, "me", err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"user": u})
}

func (s *Server) renameMe(w http.ResponseWriter, r *http.Request) {
	u := s.requireUser(w, r)
	if u == nil {
		return
	}
	var req struct {
		DisplayName string `json:"displayName"`
	}
	if !readJSON(w, r, &req, maxBody) {
		return
	}
	name, problem := cleanDisplayName(req.DisplayName)
	if problem != "" {
		fail(w, http.StatusBadRequest, problem)
		return
	}
	user, err := scanUser(s.db.QueryRow(r.Context(),
		`UPDATE users AS u SET display_name = $2 WHERE id = $1 RETURNING `+userColumns, u.ID, name))
	if uniqueViolation(err) {
		fail(w, http.StatusConflict, "That display name is taken.")
		return
	}
	if err != nil {
		failInternal(w, "rename", err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"user": user})
}

func (s *Server) deleteMe(w http.ResponseWriter, r *http.Request) {
	u := s.requireUser(w, r)
	if u == nil {
		return
	}
	if time.Since(u.signedInAt) > recentSignIn {
		writeJSON(w, http.StatusForbidden, map[string]any{
			"error": "To delete your account, sign in with Google again first.", "reauth": true,
		})
		return
	}
	if _, err := s.db.Exec(r.Context(), `DELETE FROM users WHERE id = $1`, u.ID); err != nil {
		failInternal(w, "delete account", err)
		return
	}
	s.setCookie(w, "", time.Time{})
	ok(w)
}
