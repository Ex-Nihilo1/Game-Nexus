package server

import (
	"context"
	"errors"
	"log"
	"net/http"
	"net/mail"
	"strconv"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

	"game-nexus/internal/auth"
)

// execer is a pool or a transaction.
type execer interface {
	Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error)
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

const (
	verifyTTL = 48 * time.Hour
	resetTTL  = time.Hour
)

// ---- Input rules ----

func cleanEmail(s string) (string, bool) {
	s = strings.TrimSpace(s)
	if len(s) > 254 {
		return "", false
	}
	addr, err := mail.ParseAddress(s)
	if err != nil || addr.Address != s || !strings.Contains(s[strings.LastIndex(s, "@"):], ".") {
		return "", false
	}
	return s, true
}

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

func passwordProblem(p string) string {
	n := utf8.RuneCountInString(p)
	if n < 10 {
		return "A password needs at least 10 characters."
	}
	if n > 128 {
		return "A password can have at most 128 characters."
	}
	return ""
}

func uniqueViolation(err error) string {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == "23505" {
		return pgErr.ConstraintName
	}
	return ""
}

func takenMessage(constraint string) string {
	if strings.Contains(constraint, "display_name") {
		return "That display name is taken."
	}
	return "That email already has an account. Sign in, or reset the password."
}

// ---- Sign up, in and out ----

func (s *Server) signup(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Email       string `json:"email"`
		DisplayName string `json:"displayName"`
		Password    string `json:"password"`
	}
	if !readJSON(w, r, &req, maxBody) {
		return
	}
	email, good := cleanEmail(req.Email)
	if !good {
		fail(w, http.StatusBadRequest, "That does not look like an email address.")
		return
	}
	name, problem := cleanDisplayName(req.DisplayName)
	if problem == "" {
		problem = passwordProblem(req.Password)
	}
	if problem != "" {
		fail(w, http.StatusBadRequest, problem)
		return
	}
	if !s.signupLimit.Allow(s.clientIP(r)) {
		fail(w, http.StatusTooManyRequests, "Too many new accounts from here. Try again later.")
		return
	}
	hash, err := auth.HashPassword(req.Password)
	if err != nil {
		failInternal(w, "signup", err)
		return
	}
	ctx := r.Context()
	var user *User
	err = pgx.BeginFunc(ctx, s.db, func(tx pgx.Tx) error {
		var err error
		user, err = scanUser(tx.QueryRow(ctx,
			`INSERT INTO users AS u (email, display_name, password_hash) VALUES ($1, $2, $3)
			 RETURNING `+userColumns, email, name, hash))
		if err != nil {
			return err
		}
		return s.startSession(ctx, w, r, tx, user.ID)
	})
	if c := uniqueViolation(err); c != "" {
		fail(w, http.StatusConflict, takenMessage(c))
		return
	}
	if err != nil {
		failInternal(w, "signup", err)
		return
	}
	s.sendVerify(r, user.ID, user.Email, "")
	writeJSON(w, http.StatusOK, map[string]any{"user": user})
}

func (s *Server) login(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if !readJSON(w, r, &req, maxBody) {
		return
	}
	email := strings.ToLower(strings.TrimSpace(req.Email))
	if !s.loginIPLimit.Allow(s.clientIP(r)) || !s.loginLimit.Allow(email) {
		fail(w, http.StatusTooManyRequests, "Too many tries. Wait a minute and try again.")
		return
	}
	ctx := r.Context()
	var hash string
	var id int64
	err := s.db.QueryRow(ctx, `SELECT id, password_hash FROM users WHERE email = $1`, email).Scan(&id, &hash)
	if errors.Is(err, pgx.ErrNoRows) {
		auth.SpendPasswordTime(req.Password)
		fail(w, http.StatusUnauthorized, "Wrong email or password.")
		return
	}
	if err != nil {
		failInternal(w, "login", err)
		return
	}
	if good, err := auth.CheckPassword(hash, req.Password); err != nil || !good {
		if err != nil {
			log.Printf("login: user %d: %v", id, err)
		}
		fail(w, http.StatusUnauthorized, "Wrong email or password.")
		return
	}
	if err := s.startSession(ctx, w, r, s.db, id); err != nil {
		failInternal(w, "login", err)
		return
	}
	user, err := scanUser(s.db.QueryRow(ctx, `SELECT `+userColumns+` FROM users u WHERE id = $1`, id))
	if err != nil {
		failInternal(w, "login", err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"user": user})
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

// ---- Links from emails ----

// newEmailToken replaces any earlier unused link of the same kind.
func newEmailToken(ctx context.Context, db execer, userID int64, purpose, newEmail string, ttl time.Duration) (string, error) {
	token, hash, err := auth.NewToken()
	if err != nil {
		return "", err
	}
	if _, err := db.Exec(ctx, `DELETE FROM email_tokens WHERE user_id = $1 AND purpose = $2 AND used_at IS NULL`,
		userID, purpose); err != nil {
		return "", err
	}
	var target *string
	if newEmail != "" {
		target = &newEmail
	}
	_, err = db.Exec(ctx,
		`INSERT INTO email_tokens (token_hash, user_id, purpose, new_email, expires_at) VALUES ($1, $2, $3, $4, $5)`,
		hash, userID, purpose, target, time.Now().Add(ttl))
	return token, err
}

// sendVerify mails a link that confirms an address: the account's own, or with
// newEmail set, the one the player is moving to. Mail goes out in the background.
func (s *Server) sendVerify(r *http.Request, userID int64, email, newEmail string) {
	purpose, to := "verify", email
	if newEmail != "" {
		purpose, to = "change_email", newEmail
	}
	token, err := newEmailToken(r.Context(), s.db, userID, purpose, newEmail, verifyTTL)
	if err != nil {
		log.Printf("verify link: %v", err)
		return
	}
	link := s.baseURL(r) + "/account/#verify=" + token
	body := "Confirm this email address for your Game Nexus account by opening this link:\n\n" + link +
		"\n\nThe link works for 48 hours. If you did not ask for this, ignore this email."
	go s.deliver(to, "Confirm your email for Game Nexus", body)
}

func (s *Server) deliver(to, subject, body string) {
	if err := s.mail.Send(to, subject, body); err != nil {
		log.Printf("mail to %s: %v", to, err)
	}
}

// useEmailToken marks a link used and returns who it was for. found is false when
// the link is unknown, used or out of date.
func useEmailToken(ctx context.Context, tx pgx.Tx, token string, purposes ...string) (userID int64, purpose string, newEmail *string, found bool, err error) {
	err = tx.QueryRow(ctx,
		`UPDATE email_tokens SET used_at = now()
		  WHERE token_hash = $1 AND purpose = ANY($2) AND used_at IS NULL AND expires_at > now()
		  RETURNING user_id, purpose, new_email::text`,
		auth.HashToken(token), purposes).Scan(&userID, &purpose, &newEmail)
	if errors.Is(err, pgx.ErrNoRows) {
		return 0, "", nil, false, nil
	}
	return userID, purpose, newEmail, err == nil, err
}

func (s *Server) verify(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Token string `json:"token"`
	}
	if !readJSON(w, r, &req, maxBody) {
		return
	}
	if !s.tokenIPLimit.Allow(s.clientIP(r)) {
		fail(w, http.StatusTooManyRequests, "Too many tries. Wait a minute and try again.")
		return
	}
	ctx := r.Context()
	var found bool
	var email string
	err := pgx.BeginFunc(ctx, s.db, func(tx pgx.Tx) error {
		userID, purpose, newEmail, f, err := useEmailToken(ctx, tx, req.Token, "verify", "change_email")
		if err != nil || !f {
			return err
		}
		found = true
		if purpose == "change_email" && newEmail != nil {
			return tx.QueryRow(ctx,
				`UPDATE users SET email = $2, email_verified_at = now() WHERE id = $1 RETURNING email::text`,
				userID, *newEmail).Scan(&email)
		}
		return tx.QueryRow(ctx,
			`UPDATE users SET email_verified_at = coalesce(email_verified_at, now()) WHERE id = $1 RETURNING email::text`,
			userID).Scan(&email)
	})
	if uniqueViolation(err) != "" {
		fail(w, http.StatusConflict, "That email has an account of its own by now.")
		return
	}
	if err != nil {
		failInternal(w, "verify", err)
		return
	}
	if !found {
		fail(w, http.StatusGone, "This link has been used or is out of date. Ask for a new one.")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "email": email})
}

func (s *Server) resend(w http.ResponseWriter, r *http.Request) {
	u := s.requireUser(w, r)
	if u == nil {
		return
	}
	if u.Verified {
		fail(w, http.StatusBadRequest, "Your email is already confirmed.")
		return
	}
	if !s.mailLimit.Allow(strings.ToLower(u.Email)) {
		fail(w, http.StatusTooManyRequests, "An email is already on its way. Wait a few minutes before asking again.")
		return
	}
	s.sendVerify(r, u.ID, u.Email, "")
	ok(w)
}

func (s *Server) forgot(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Email string `json:"email"`
	}
	if !readJSON(w, r, &req, maxBody) {
		return
	}
	email := strings.ToLower(strings.TrimSpace(req.Email))
	if !s.tokenIPLimit.Allow(s.clientIP(r)) || !s.mailLimit.Allow(email) {
		fail(w, http.StatusTooManyRequests, "Too many tries. Wait a few minutes and try again.")
		return
	}
	ctx := r.Context()
	var id int64
	var to string
	err := s.db.QueryRow(ctx, `SELECT id, email::text FROM users WHERE email = $1`, email).Scan(&id, &to)
	if err == nil {
		token, err := newEmailToken(ctx, s.db, id, "reset", "", resetTTL)
		if err != nil {
			failInternal(w, "forgot", err)
			return
		}
		link := s.baseURL(r) + "/account/#reset=" + token
		go s.deliver(to, "Reset your Game Nexus password",
			"Someone asked to reset the password of your Game Nexus account. To choose a new one, open this link:\n\n"+
				link+"\n\nThe link works for one hour. If it was not you, ignore this email: your password stays as it is.")
	} else if !errors.Is(err, pgx.ErrNoRows) {
		failInternal(w, "forgot", err)
		return
	}
	ok(w)
}

func (s *Server) reset(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Token    string `json:"token"`
		Password string `json:"password"`
	}
	if !readJSON(w, r, &req, maxBody) {
		return
	}
	if p := passwordProblem(req.Password); p != "" {
		fail(w, http.StatusBadRequest, p)
		return
	}
	if !s.tokenIPLimit.Allow(s.clientIP(r)) {
		fail(w, http.StatusTooManyRequests, "Too many tries. Wait a minute and try again.")
		return
	}
	hash, err := auth.HashPassword(req.Password)
	if err != nil {
		failInternal(w, "reset", err)
		return
	}
	ctx := r.Context()
	var user *User
	err = pgx.BeginFunc(ctx, s.db, func(tx pgx.Tx) error {
		userID, _, _, found, err := useEmailToken(ctx, tx, req.Token, "reset")
		if err != nil || !found {
			return err
		}
		user, err = scanUser(tx.QueryRow(ctx,
			`UPDATE users AS u SET password_hash = $2, email_verified_at = coalesce(email_verified_at, now())
			  WHERE id = $1 RETURNING `+userColumns, userID, hash))
		if err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `DELETE FROM sessions WHERE user_id = $1`, userID); err != nil {
			return err
		}
		return s.startSession(ctx, w, r, tx, userID)
	})
	if err != nil {
		failInternal(w, "reset", err)
		return
	}
	if user == nil {
		fail(w, http.StatusGone, "This link has been used or is out of date. Ask for a new one.")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"user": user})
}

// ---- The signed-in account ----

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
	if c := uniqueViolation(err); c != "" {
		fail(w, http.StatusConflict, takenMessage(c))
		return
	}
	if err != nil {
		failInternal(w, "rename", err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"user": user})
}

// checkOwnPassword guards account changes. On false it has already answered.
func (s *Server) checkOwnPassword(w http.ResponseWriter, r *http.Request, u *User, password string) bool {
	if !s.accountLimits.Allow(strconv.FormatInt(u.ID, 10)) {
		fail(w, http.StatusTooManyRequests, "Too many tries. Wait a minute and try again.")
		return false
	}
	var hash string
	if err := s.db.QueryRow(r.Context(), `SELECT password_hash FROM users WHERE id = $1`, u.ID).Scan(&hash); err != nil {
		failInternal(w, "password check", err)
		return false
	}
	if good, _ := auth.CheckPassword(hash, password); !good {
		fail(w, http.StatusForbidden, "That is not your current password.")
		return false
	}
	return true
}

func (s *Server) changePassword(w http.ResponseWriter, r *http.Request) {
	u := s.requireUser(w, r)
	if u == nil {
		return
	}
	var req struct {
		Current  string `json:"current"`
		Password string `json:"password"`
	}
	if !readJSON(w, r, &req, maxBody) {
		return
	}
	if p := passwordProblem(req.Password); p != "" {
		fail(w, http.StatusBadRequest, p)
		return
	}
	if !s.checkOwnPassword(w, r, u, req.Current) {
		return
	}
	hash, err := auth.HashPassword(req.Password)
	if err != nil {
		failInternal(w, "password", err)
		return
	}
	ctx := r.Context()
	err = pgx.BeginFunc(ctx, s.db, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `UPDATE users SET password_hash = $2 WHERE id = $1`, u.ID, hash); err != nil {
			return err
		}
		_, err := tx.Exec(ctx, `DELETE FROM sessions WHERE user_id = $1 AND token_hash <> $2`, u.ID, s.sessionHash(r))
		return err
	})
	if err != nil {
		failInternal(w, "password", err)
		return
	}
	ok(w)
}

func (s *Server) changeEmail(w http.ResponseWriter, r *http.Request) {
	u := s.requireUser(w, r)
	if u == nil {
		return
	}
	var req struct {
		Password string `json:"password"`
		Email    string `json:"email"`
	}
	if !readJSON(w, r, &req, maxBody) {
		return
	}
	email, good := cleanEmail(req.Email)
	if !good {
		fail(w, http.StatusBadRequest, "That does not look like an email address.")
		return
	}
	if strings.EqualFold(email, u.Email) {
		fail(w, http.StatusBadRequest, "That is already your email.")
		return
	}
	if !s.checkOwnPassword(w, r, u, req.Password) {
		return
	}
	var taken bool
	if err := s.db.QueryRow(r.Context(), `SELECT EXISTS (SELECT 1 FROM users WHERE email = $1)`, email).Scan(&taken); err != nil {
		failInternal(w, "change email", err)
		return
	}
	if taken {
		fail(w, http.StatusConflict, takenMessage("email"))
		return
	}
	if !s.mailLimit.Allow(strings.ToLower(email)) {
		fail(w, http.StatusTooManyRequests, "An email is already on its way. Wait a few minutes before asking again.")
		return
	}
	s.sendVerify(r, u.ID, u.Email, email)
	ok(w)
}

func (s *Server) deleteMe(w http.ResponseWriter, r *http.Request) {
	u := s.requireUser(w, r)
	if u == nil {
		return
	}
	var req struct {
		Password string `json:"password"`
	}
	if !readJSON(w, r, &req, maxBody) {
		return
	}
	if !s.checkOwnPassword(w, r, u, req.Password) {
		return
	}
	if _, err := s.db.Exec(r.Context(), `DELETE FROM users WHERE id = $1`, u.ID); err != nil {
		failInternal(w, "delete account", err)
		return
	}
	s.setCookie(w, "", time.Time{})
	ok(w)
}
