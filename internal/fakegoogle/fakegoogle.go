// Package fakegoogle stands in for Google's sign-in in development and tests. It
// speaks just enough OAuth 2.0 (authorization code with PKCE) and OpenID Connect
// for the server's sign-in to run unchanged: a page where you type any account id,
// and a token endpoint that hands back an unsigned ID token for it.
//
// Never point a public server at it: anyone could sign in as anyone.
package fakegoogle

import (
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"html/template"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
)

// Provider is the fake. Issuer goes into the ID tokens as `iss`; ClientID and
// ClientSecret are what the server must present.
type Provider struct {
	Issuer       string
	ClientID     string
	ClientSecret string

	// Tamper, when set, may change an ID token's claims before it is issued; tests
	// use it to send a wrong audience or nonce.
	Tamper func(claims map[string]any)

	mu    sync.Mutex
	codes map[string]grant
}

type grant struct {
	sub, nonce, challenge, clientID, redirect string
	expires                                   time.Time
}

func New(issuer, clientID, clientSecret string) *Provider {
	return &Provider{Issuer: strings.TrimRight(issuer, "/"), ClientID: clientID, ClientSecret: clientSecret, codes: map[string]grant{}}
}

func (p *Provider) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	switch {
	case r.URL.Path == "/authorize" && r.Method == http.MethodGet:
		p.page(w, r)
	case r.URL.Path == "/authorize" && r.Method == http.MethodPost:
		p.authorize(w, r)
	case r.URL.Path == "/token" && r.Method == http.MethodPost:
		p.token(w, r)
	default:
		http.NotFound(w, r)
	}
}

func random(n int) string {
	b := make([]byte, n)
	rand.Read(b)
	return base64.RawURLEncoding.EncodeToString(b)
}

var pageTemplate = template.Must(template.New("page").Parse(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Fake Google (development)</title>
<style>
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #13243B; color: #E8EFF7;
         font: 14px Bahnschrift, "Segoe UI", system-ui, sans-serif; }
  form { width: min(360px, calc(100vw - 32px)); padding: 22px; border: 1px solid #3A5580; border-radius: 3px; background: #1A3150; }
  h1 { margin: 0 0 6px; font-size: 18px; }
  p { margin: 0 0 16px; color: #94A9C6; line-height: 1.45; }
  label { display: block; margin-bottom: 4px; color: #94A9C6; font-size: 12px; }
  input[type=text] { box-sizing: border-box; width: 100%; height: 32px; padding: 0 10px; margin-bottom: 16px;
         font: inherit; color: inherit; background: #13243B; border: 1px solid #3A5580; border-radius: 3px; }
  .row { display: flex; gap: 8px; justify-content: flex-end; }
  button { height: 32px; padding: 0 14px; font: inherit; border: 1px solid #E8EFF7; border-radius: 3px; cursor: pointer;
         background: transparent; color: inherit; }
  button[value=allow] { background: #E8EFF7; color: #1A3150; }
</style></head>
<body><form method="post" action="authorize">
  <h1>Fake Google (development)</h1>
  <p>Stands in for Google while developing. Any account id signs in; the same id is the same account.</p>
  <label for="sub">Account id</label>
  <input type="text" id="sub" name="sub" value="{{.Sub}}" required maxlength="100" autofocus>
  {{range $k, $v := .Hidden}}<input type="hidden" name="{{$k}}" value="{{$v}}">{{end}}
  <div class="row"><button name="action" value="cancel">Cancel</button><button name="action" value="allow">Sign in</button></div>
</form></body></html>`))

// page asks for an account id. The request's parameters ride along in the form.
func (p *Provider) page(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	if q.Get("response_type") != "code" || q.Get("client_id") != p.ClientID || q.Get("redirect_uri") == "" ||
		q.Get("code_challenge") == "" || q.Get("code_challenge_method") != "S256" {
		http.Error(w, "fake Google: not a request it understands (code flow with PKCE S256, this client id)", http.StatusBadRequest)
		return
	}
	hidden := map[string]string{}
	for _, k := range []string{"client_id", "redirect_uri", "state", "nonce", "code_challenge"} {
		hidden[k] = q.Get(k)
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	pageTemplate.Execute(w, map[string]any{"Sub": "dev-" + random(4), "Hidden": hidden})
}

func (p *Provider) authorize(w http.ResponseWriter, r *http.Request) {
	r.ParseForm()
	target, err := url.Parse(r.PostForm.Get("redirect_uri"))
	if err != nil || target.Scheme == "" {
		http.Error(w, "fake Google: bad redirect_uri", http.StatusBadRequest)
		return
	}
	q := target.Query()
	q.Set("state", r.PostForm.Get("state"))
	if r.PostForm.Get("action") == "cancel" {
		q.Set("error", "access_denied")
	} else {
		sub := strings.TrimSpace(r.PostForm.Get("sub"))
		if sub == "" {
			http.Error(w, "fake Google: an account id is needed", http.StatusBadRequest)
			return
		}
		code := random(16)
		p.mu.Lock()
		p.codes[code] = grant{
			sub: sub, nonce: r.PostForm.Get("nonce"), challenge: r.PostForm.Get("code_challenge"),
			clientID: r.PostForm.Get("client_id"), redirect: r.PostForm.Get("redirect_uri"),
			expires: time.Now().Add(time.Minute),
		}
		p.mu.Unlock()
		q.Set("code", code)
	}
	target.RawQuery = q.Encode()
	http.Redirect(w, r, target.String(), http.StatusFound)
}

func tokenError(w http.ResponseWriter, code, description string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusBadRequest)
	json.NewEncoder(w).Encode(map[string]string{"error": code, "error_description": description})
}

func (p *Provider) token(w http.ResponseWriter, r *http.Request) {
	r.ParseForm()
	f := r.PostForm
	id, secret, ok := r.BasicAuth()
	if !ok {
		id, secret = f.Get("client_id"), f.Get("client_secret")
	}
	if id != p.ClientID || subtle.ConstantTimeCompare([]byte(secret), []byte(p.ClientSecret)) != 1 {
		tokenError(w, "invalid_client", "wrong client id or secret")
		return
	}
	p.mu.Lock()
	g, found := p.codes[f.Get("code")]
	delete(p.codes, f.Get("code")) // a code works once
	p.mu.Unlock()
	sum := sha256.Sum256([]byte(f.Get("code_verifier")))
	switch {
	case f.Get("grant_type") != "authorization_code":
		tokenError(w, "unsupported_grant_type", "only authorization_code")
	case !found || time.Now().After(g.expires):
		tokenError(w, "invalid_grant", "unknown, used or expired code")
	case g.clientID != id || g.redirect != f.Get("redirect_uri"):
		tokenError(w, "invalid_grant", "client or redirect_uri differ from the authorization request")
	case base64.RawURLEncoding.EncodeToString(sum[:]) != g.challenge:
		tokenError(w, "invalid_grant", "code_verifier does not match the code_challenge")
	default:
		now := time.Now()
		claims := map[string]any{
			"iss": p.Issuer, "aud": id, "sub": g.sub, "iat": now.Unix(), "exp": now.Add(time.Hour).Unix(),
		}
		if g.nonce != "" {
			claims["nonce"] = g.nonce
		}
		if p.Tamper != nil {
			p.Tamper(claims)
		}
		header, _ := json.Marshal(map[string]string{"alg": "none", "typ": "JWT"})
		body, _ := json.Marshal(claims)
		idToken := base64.RawURLEncoding.EncodeToString(header) + "." + base64.RawURLEncoding.EncodeToString(body) + "."
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]any{
			"access_token": random(16), "token_type": "Bearer", "expires_in": 3600, "id_token": idToken,
		})
	}
}
