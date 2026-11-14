package server

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"strings"
	"time"

	"golang.org/x/oauth2"
)

// Google is the OAuth client the server signs players in with. The endpoints
// default to Google's own; development points them at internal/fakegoogle.
type Google struct {
	ClientID     string
	ClientSecret string
	AuthURL      string // where the browser is sent
	TokenURL     string // where the server exchanges the code
	Issuer       string // the `iss` the ID token must carry; empty for Google's own
}

const (
	googleAuthURL  = "https://accounts.google.com/o/oauth2/v2/auth"
	googleTokenURL = "https://oauth2.googleapis.com/token"
	oauthTTL       = 10 * time.Minute
)

// Custom reports whether the endpoints are someone else's than Google's.
func (g Google) Custom() bool {
	return (g.AuthURL != "" && g.AuthURL != googleAuthURL) || (g.TokenURL != "" && g.TokenURL != googleTokenURL) || g.Issuer != ""
}

func (g Google) issuers() []string {
	if g.Issuer != "" {
		return []string{strings.TrimRight(g.Issuer, "/")}
	}
	return []string{"https://accounts.google.com", "accounts.google.com"}
}

func (s *Server) oauthConfig(r *http.Request) *oauth2.Config {
	g := s.cfg.Google
	auth, token := g.AuthURL, g.TokenURL
	if auth == "" {
		auth = googleAuthURL
	}
	if token == "" {
		token = googleTokenURL
	}
	return &oauth2.Config{
		ClientID:     g.ClientID,
		ClientSecret: g.ClientSecret,
		Endpoint:     oauth2.Endpoint{AuthURL: auth, TokenURL: token, AuthStyle: oauth2.AuthStyleInParams},
		RedirectURL:  s.baseURL(r) + "/api/auth/google/callback",
		Scopes:       []string{"openid"}, // nothing but the account id
	}
}

// What the browser carries between the two halves of a sign-in.
type oauthState struct {
	State    string `json:"state"`
	Verifier string `json:"verifier"`
	Nonce    string `json:"nonce"`
	Back     string `json:"back"`
}

func (s *Server) oauthCookieName() string {
	if s.secureCookies() {
		return "__Secure-nexus-oauth"
	}
	return "nexus-oauth"
}

func (s *Server) setOAuthCookie(w http.ResponseWriter, value string, maxAge int) {
	http.SetCookie(w, &http.Cookie{
		Name: s.oauthCookieName(), Value: value, Path: "/api/auth/google", MaxAge: maxAge,
		HttpOnly: true, Secure: s.secureCookies(), SameSite: http.SameSiteLaxMode,
	})
}

func randomString() string {
	b := make([]byte, 32)
	rand.Read(b)
	return base64.RawURLEncoding.EncodeToString(b)
}

// samePath keeps a "come back here" address on this site.
func samePath(back string) string {
	if !strings.HasPrefix(back, "/") || strings.HasPrefix(back, "//") || strings.HasPrefix(back, "/\\") || len(back) > 500 {
		return "/"
	}
	return back
}

func accountPage(params url.Values) string { return "/account/?" + params.Encode() }

func (s *Server) googleStart(w http.ResponseWriter, r *http.Request) {
	back := samePath(r.URL.Query().Get("back"))
	if s.cfg.Google.ClientID == "" {
		log.Printf("sign-in: no Google client is set up (NEXUS_GOOGLE_CLIENT_ID)")
		http.Redirect(w, r, accountPage(url.Values{"error": {"unavailable"}}), http.StatusFound)
		return
	}
	if !s.authLimit.Allow(s.clientIP(r)) {
		http.Redirect(w, r, accountPage(url.Values{"error": {"busy"}}), http.StatusFound)
		return
	}
	st := oauthState{State: randomString(), Verifier: oauth2.GenerateVerifier(), Nonce: randomString(), Back: back}
	raw, _ := json.Marshal(st)
	s.setOAuthCookie(w, base64.RawURLEncoding.EncodeToString(raw), int(oauthTTL.Seconds()))
	target := s.oauthConfig(r).AuthCodeURL(st.State,
		oauth2.S256ChallengeOption(st.Verifier),
		oauth2.SetAuthURLParam("nonce", st.Nonce),
		oauth2.SetAuthURLParam("prompt", "select_account"))
	http.Redirect(w, r, target, http.StatusFound)
}

func (s *Server) googleCallback(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	failed := func(reason string, err error) {
		log.Printf("sign-in failed: %s: %v", reason, err)
		http.Redirect(w, r, accountPage(url.Values{"error": {"failed"}}), http.StatusFound)
	}

	var st oauthState
	c, err := r.Cookie(s.oauthCookieName())
	s.setOAuthCookie(w, "", -1) // one sign-in per cookie, whatever happens
	if err != nil {
		failed("no sign-in in progress", err)
		return
	}
	raw, err := base64.RawURLEncoding.DecodeString(c.Value)
	if err == nil {
		err = json.Unmarshal(raw, &st)
	}
	if err != nil || st.State == "" || q.Get("state") != st.State {
		failed("state", fmt.Errorf("does not match: %v", err))
		return
	}
	if e := q.Get("error"); e != "" {
		if e == "access_denied" {
			http.Redirect(w, r, accountPage(url.Values{"error": {"cancelled"}, "back": {st.Back}}), http.StatusFound)
		} else {
			failed("google", errors.New(e))
		}
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()
	token, err := s.oauthConfig(r).Exchange(ctx, q.Get("code"), oauth2.VerifierOption(st.Verifier))
	if err != nil {
		failed("code exchange", err)
		return
	}
	idToken, _ := token.Extra("id_token").(string)
	sub, err := s.checkIDToken(idToken, st.Nonce)
	if err != nil {
		failed("id token", err)
		return
	}

	var id int64
	var named bool
	err = s.db.QueryRow(r.Context(),
		`INSERT INTO users (google_sub) VALUES ($1)
		 ON CONFLICT (google_sub) DO UPDATE SET google_sub = EXCLUDED.google_sub
		 RETURNING id, display_name IS NOT NULL`, sub).Scan(&id, &named)
	if err == nil {
		err = s.startSession(r.Context(), w, r, s.db, id)
	}
	if err != nil {
		failed("account", err)
		return
	}
	if !named {
		http.Redirect(w, r, accountPage(url.Values{"choose": {""}, "back": {st.Back}}), http.StatusFound)
		return
	}
	http.Redirect(w, r, st.Back, http.StatusFound)
}

// checkIDToken reads the account id out of an ID token. The token came straight
// from the token endpoint over TLS in answer to this server's client secret, so its
// signature need not be checked (Google's OpenID Connect documentation says as
// much); its claims still must be for this client, from this issuer, current, and
// for this sign-in (nonce).
func (s *Server) checkIDToken(idToken, nonce string) (string, error) {
	parts := strings.Split(idToken, ".")
	if len(parts) != 3 {
		return "", errors.New("not a JWT")
	}
	payload, err := base64.RawURLEncoding.DecodeString(strings.TrimRight(parts[1], "="))
	if err != nil {
		return "", fmt.Errorf("payload: %w", err)
	}
	var claims struct {
		Iss   string          `json:"iss"`
		Aud   json.RawMessage `json:"aud"`
		Sub   string          `json:"sub"`
		Exp   int64           `json:"exp"`
		Nonce string          `json:"nonce"`
	}
	if err := json.Unmarshal(payload, &claims); err != nil {
		return "", fmt.Errorf("claims: %w", err)
	}
	issuerOK := false
	for _, iss := range s.cfg.Google.issuers() {
		issuerOK = issuerOK || claims.Iss == iss
	}
	var audiences []string
	if err := json.Unmarshal(claims.Aud, &audiences); err != nil {
		var one string
		json.Unmarshal(claims.Aud, &one)
		audiences = []string{one}
	}
	audOK := false
	for _, aud := range audiences {
		audOK = audOK || aud == s.cfg.Google.ClientID
	}
	switch {
	case !issuerOK:
		return "", fmt.Errorf("issuer %q", claims.Iss)
	case !audOK:
		return "", fmt.Errorf("audience %s", claims.Aud)
	case time.Now().Unix() > claims.Exp:
		return "", errors.New("expired")
	case claims.Nonce != nonce:
		return "", errors.New("nonce")
	case claims.Sub == "" || len(claims.Sub) > 255:
		return "", errors.New("no account id")
	}
	return claims.Sub, nil
}
