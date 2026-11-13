package server

// These tests run the API against a real PostgreSQL database. Point
// NEXUS_TEST_DATABASE_URL at an empty database that may be wiped, e.g.
//
//	NEXUS_TEST_DATABASE_URL="postgres://postgres@127.0.0.1:54329/nexus-test" go test ./internal/server
//
// Without it they are skipped.

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"os"
	"regexp"
	"strings"
	"testing"
	"time"

	"game-nexus/internal/db"
)

type mailbox chan [3]string

func (m mailbox) Send(to, subject, body string) error {
	m <- [3]string{to, subject, body}
	return nil
}

// link waits for the next email and returns the token in its link.
func (m mailbox) link(t *testing.T, to, kind string) string {
	t.Helper()
	select {
	case msg := <-m:
		if msg[0] != to {
			t.Fatalf("mail went to %s, not %s", msg[0], to)
		}
		found := regexp.MustCompile(`#` + kind + `=([A-Za-z0-9_-]+)`).FindStringSubmatch(msg[2])
		if found == nil {
			t.Fatalf("no %s link in %q", kind, msg[2])
		}
		return found[1]
	case <-time.After(3 * time.Second):
		t.Fatalf("no mail to %s", to)
	}
	return ""
}

type client struct {
	t    *testing.T
	base string
	http *http.Client
}

// call sends a JSON request and decodes the answer into a map.
func (c *client) call(method, path string, body any, wantStatus int) map[string]any {
	c.t.Helper()
	var reader io.Reader
	if body != nil {
		raw, _ := json.Marshal(body)
		reader = bytes.NewReader(raw)
	}
	req, _ := http.NewRequest(method, c.base+path, reader)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Nexus", "1")
	res, err := c.http.Do(req)
	if err != nil {
		c.t.Fatal(err)
	}
	defer res.Body.Close()
	var out map[string]any
	raw, _ := io.ReadAll(res.Body)
	json.Unmarshal(raw, &out)
	if res.StatusCode != wantStatus {
		c.t.Fatalf("%s %s: status %d, want %d: %s", method, path, res.StatusCode, wantStatus, raw)
	}
	return out
}

func newClient(t *testing.T, base string) *client {
	jar, _ := cookiejar.New(nil)
	return &client{t: t, base: base, http: &http.Client{Jar: jar}}
}

func setup(t *testing.T) (string, mailbox) {
	url := os.Getenv("NEXUS_TEST_DATABASE_URL")
	if url == "" {
		t.Skip("NEXUS_TEST_DATABASE_URL is not set")
	}
	ctx := context.Background()
	pool, err := db.Open(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `DROP SCHEMA public CASCADE; CREATE SCHEMA public`); err != nil {
		t.Fatal(err)
	}
	pool.Close()
	pool, err = db.Open(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)

	mails := make(mailbox, 10)
	web := t.TempDir()
	os.WriteFile(web+"/index.html", []byte("<!doctype html><title>Game Nexus</title>"), 0o644)
	srv := New(Config{WebRoot: web}, pool, mails)
	ts := httptest.NewServer(srv.Handler())
	t.Cleanup(ts.Close)
	return ts.URL, mails
}

func signUp(t *testing.T, base string, mails mailbox, email, name string, verify bool) *client {
	c := newClient(t, base)
	out := c.call("POST", "/api/auth/signup", map[string]string{"email": email, "displayName": name, "password": "a long password"}, 200)
	if out["user"].(map[string]any)["verified"] != false {
		t.Fatal("a new account is verified")
	}
	token := mails.link(t, email, "verify")
	if verify {
		newClient(t, base).call("POST", "/api/auth/verify", map[string]string{"token": token}, 200)
	}
	return c
}

func TestAccounts(t *testing.T) {
	base, mails := setup(t)
	ann := signUp(t, base, mails, "ann@example.com", "Ann", true)

	if me := ann.call("GET", "/api/me", nil, 200)["user"].(map[string]any); me["displayName"] != "Ann" || me["verified"] != true {
		t.Fatalf("me: %v", me)
	}
	guest := newClient(t, base)
	if guest.call("GET", "/api/me", nil, 200)["user"] != nil {
		t.Fatal("a guest has a user")
	}

	// Taken names and addresses, case aside; bad input.
	guest.call("POST", "/api/auth/signup", map[string]string{"email": "ANN@example.com", "displayName": "Other", "password": "a long password"}, 409)
	guest.call("POST", "/api/auth/signup", map[string]string{"email": "other@example.com", "displayName": "aNN", "password": "a long password"}, 409)
	guest.call("POST", "/api/auth/signup", map[string]string{"email": "nope", "displayName": "Nope", "password": "a long password"}, 400)
	guest.call("POST", "/api/auth/signup", map[string]string{"email": "short@example.com", "displayName": "Short", "password": "short"}, 400)
	guest.call("POST", "/api/auth/signup", map[string]string{"email": "x@example.com", "displayName": "<b>", "password": "a long password"}, 400)

	// Requests without the site's header are refused.
	res, _ := http.Post(base+"/api/auth/login", "application/json", strings.NewReader(`{}`))
	if res.StatusCode != 403 {
		t.Fatalf("login without X-Nexus: %d", res.StatusCode)
	}

	// Signing in and out.
	guest.call("POST", "/api/auth/login", map[string]string{"email": "ann@example.com", "password": "wrong password"}, 401)
	guest.call("POST", "/api/auth/login", map[string]string{"email": "nobody@example.com", "password": "wrong password"}, 401)
	second := newClient(t, base)
	second.call("POST", "/api/auth/login", map[string]string{"email": "Ann@Example.com", "password": "a long password"}, 200)
	ann.call("POST", "/api/auth/logout", nil, 200)
	if ann.call("GET", "/api/me", nil, 200)["user"] != nil {
		t.Fatal("still signed in after signing out")
	}

	// A reset signs out every browser and signs this one in.
	guest.call("POST", "/api/auth/forgot", map[string]string{"email": "nobody@example.com"}, 200)
	guest.call("POST", "/api/auth/forgot", map[string]string{"email": "ann@example.com"}, 200)
	token := mails.link(t, "ann@example.com", "reset")
	guest.call("POST", "/api/auth/reset", map[string]string{"token": token, "password": "a new long password"}, 200)
	guest.call("POST", "/api/auth/reset", map[string]string{"token": token, "password": "a third password"}, 410)
	if second.call("GET", "/api/me", nil, 200)["user"] != nil {
		t.Fatal("another browser is still signed in after a reset")
	}
	if guest.call("GET", "/api/me", nil, 200)["user"] == nil {
		t.Fatal("not signed in after a reset")
	}

	// Account changes need the password.
	guest.call("PATCH", "/api/me", map[string]string{"displayName": "Ann the Second"}, 200)
	guest.call("POST", "/api/me/password", map[string]string{"current": "a long password", "password": "whatever else"}, 403)
	guest.call("POST", "/api/me/password", map[string]string{"current": "a new long password", "password": "yet another password"}, 200)
	guest.call("POST", "/api/me/email", map[string]string{"password": "yet another password", "email": "ann2@example.com"}, 200)
	token = mails.link(t, "ann2@example.com", "verify")
	if out := guest.call("POST", "/api/auth/verify", map[string]string{"token": token}, 200); out["email"] != "ann2@example.com" {
		t.Fatalf("verify: %v", out)
	}
	guest.call("DELETE", "/api/me", map[string]string{"password": "nope nope nope"}, 403)
	guest.call("DELETE", "/api/me", map[string]string{"password": "yet another password"}, 200)
	newClient(t, base).call("POST", "/api/auth/login", map[string]string{"email": "ann2@example.com", "password": "yet another password"}, 401)
}

func TestSaves(t *testing.T) {
	base, mails := setup(t)
	bo := signUp(t, base, mails, "bo@example.com", "Bob", false)
	other := newClient(t, base)
	other.call("POST", "/api/auth/login", map[string]string{"email": "bo@example.com", "password": "a long password"}, 200)

	newClient(t, base).call("GET", "/api/saves", nil, 401)
	bo.call("PUT", "/api/saves/not.a.key", map[string]any{"value": "1", "baseRev": 0}, 400)

	if out := bo.call("PUT", "/api/saves/games.tetris.best", map[string]any{"value": "100", "baseRev": 0, "device": "laptop"}, 200); out["rev"] != 1.0 {
		t.Fatalf("first write: %v", out)
	}
	// The other device has not seen rev 1: it gets the account's copy back, and which
	// device wrote it.
	out := other.call("PUT", "/api/saves/games.tetris.best", map[string]any{"value": "50", "baseRev": 0, "device": "phone"}, 409)
	if out["value"] != "100" || out["rev"] != 1.0 || out["device"] != "laptop" {
		t.Fatalf("conflict: %v", out)
	}
	// Choosing this device's copy is writing again on top of what the account has.
	other.call("PUT", "/api/saves/games.tetris.best", map[string]any{"value": "50", "baseRev": 1}, 200)
	bo.call("PUT", "/api/saves/games.scheme", map[string]any{"value": nil, "baseRev": 0}, 200)

	list := bo.call("GET", "/api/saves", nil, 200)["saves"].([]any)
	if len(list) != 2 {
		t.Fatalf("list: %v", list)
	}
	if got := bo.call("GET", "/api/saves/games.tetris.best", nil, 200); got["value"] != "50" || got["rev"] != 2.0 || got["device"] != "" {
		t.Fatalf("get: %v", got)
	}
	if got := bo.call("GET", "/api/saves/games.scheme", nil, 200); got["value"] != nil {
		t.Fatalf("removed key: %v", got)
	}
	big := strings.Repeat("x", 1<<20+1)
	bo.call("PUT", "/api/saves/games.steelspell.save", map[string]any{"value": big, "baseRev": 0}, 413)
}

func TestRunsAndBoards(t *testing.T) {
	base, mails := setup(t)
	cy := signUp(t, base, mails, "cy@example.com", "Cyd", true)
	di := signUp(t, base, mails, "di@example.com", "Dina", true)
	un := signUp(t, base, mails, "un@example.com", "Unconfirmed", false)

	play := func(c *client, game string, stats map[string]any, want int) map[string]any {
		id := c.call("POST", "/api/runs", map[string]string{"game": game}, 200)["id"].(string)
		return c.call("POST", "/api/runs/"+id+"/finish", map[string]any{"stats": stats}, want)
	}
	tetris := func(score, lines int) map[string]any {
		return map[string]any{"score": score, "lines": lines, "level": lines/10 + 1, "seconds": 5}
	}

	out := play(cy, "tetris", tetris(500, 4), 200)
	ranks := out["ranks"].([]any)
	if len(ranks) != 2 || ranks[0].(map[string]any)["rank"] != 1.0 || ranks[0].(map[string]any)["isNew"] != true {
		t.Fatalf("ranks: %v", out)
	}
	play(di, "tetris", tetris(900, 6), 200)
	play(cy, "tetris", tetris(300, 2), 200) // worse than Cy's best: Cy stays at 500
	if out := play(un, "tetris", tetris(5000, 12), 200); len(out["ranks"].([]any)) != 0 || out["verified"] != false {
		t.Fatalf("unconfirmed player ranked: %v", out)
	}
	play(cy, "tetris", map[string]any{"score": 1, "lines": 0, "level": 1, "seconds": 9999}, 400) // longer than the run
	play(cy, "tetris", map[string]any{"score": 1, "lines": 0, "level": 1, "seconds": 1, "extra": 1}, 400)
	cy.call("POST", "/api/runs", map[string]string{"game": "chronomancer"}, 400)

	// A run counts once.
	id := cy.call("POST", "/api/runs", map[string]string{"game": "tetris"}, 200)["id"].(string)
	cy.call("POST", "/api/runs/"+id+"/finish", map[string]any{"stats": tetris(10, 0)}, 200)
	cy.call("POST", "/api/runs/"+id+"/finish", map[string]any{"stats": tetris(10, 0)}, 409)
	di.call("POST", "/api/runs/"+id+"/finish", map[string]any{"stats": tetris(10, 0)}, 404)

	board := newClient(t, base).call("GET", "/api/boards/tetris/score", nil, 200)
	rows := board["rows"].([]any)
	if len(rows) != 2 || rows[0].(map[string]any)["displayName"] != "Dina" || rows[1].(map[string]any)["value"] != 500.0 {
		t.Fatalf("board: %v", rows)
	}
	if mine := cy.call("GET", "/api/boards/tetris/score?period=week", nil, 200)["me"].(map[string]any); mine["rank"] != 2.0 {
		t.Fatalf("my row: %v", mine)
	}
	newClient(t, base).call("GET", "/api/boards/tetris/nope", nil, 404)
	newClient(t, base).call("GET", "/api/boards/tetris/score?period=year", nil, 400)

	// Every Minesweeper board shares one list, ranked by 3BV a second; rows carry the board.
	mine := func(won bool, seconds float64, cols, rows, bbbv int, mode string) map[string]any {
		return map[string]any{"won": won, "seconds": seconds, "cols": cols, "rows": rows, "minePct": 16, "mode": mode, "bbbv": bbbv}
	}
	play(cy, "minesweeper", mine(true, 3, 9, 9, 6, "classic"), 200)    // 2 clicks a second
	play(cy, "minesweeper", mine(true, 4, 9, 9, 6, "classic"), 200)    // 1.5: not Cyd's best
	play(cy, "minesweeper", mine(false, 1, 9, 9, 0, "classic"), 200)   // a loss
	play(di, "minesweeper", mine(true, 4, 30, 16, 10, "noguess"), 200) // 2.5, on a big board
	speed := newClient(t, base).call("GET", "/api/boards/minesweeper/speed", nil, 200)["rows"].([]any)
	if len(speed) != 2 || speed[0].(map[string]any)["displayName"] != "Dina" || speed[1].(map[string]any)["value"] != 2.0 {
		t.Fatalf("speed: %v", speed)
	}
	if board := speed[0].(map[string]any)["stats"].(map[string]any); board["cols"] != 30.0 || board["mode"] != "noguess" {
		t.Fatalf("row stats: %v", board)
	}
	classic := newClient(t, base).call("GET", "/api/boards/minesweeper/speed?filter=classic", nil, 200)["rows"].([]any)
	if len(classic) != 1 || classic[0].(map[string]any)["displayName"] != "Cyd" {
		t.Fatalf("classic only: %v", classic)
	}
	wins := newClient(t, base).call("GET", "/api/boards/minesweeper/wins", nil, 200)["rows"].([]any)
	if wins[0].(map[string]any)["value"] != 2.0 || wins[0].(map[string]any)["stats"] != nil {
		t.Fatalf("wins: %v", wins)
	}

	// Steel & Spell boards filter by starting weapon, named as the game named it.
	ss := func(start, name string, time float64) map[string]any {
		return map[string]any{"version": "0.2.3", "time": time, "level": 3, "kills": 40, "elites": 0, "merges": 0,
			"active": "flash", "activeName": "Flash", "start": start, "startName": name, "health": 120,
			"weapons": []map[string]any{{"id": start, "name": name, "evo": "", "evoName": "", "level": 2, "kind": "Physical", "dealt": 500}},
			"items":   []map[string]any{{"id": "vest", "name": "Padded Vest", "rarity": "grey"}},
			"hurt":    map[string]any{"touch": 10, "shot": 0, "strike": 0},
			"picks":   []map[string]any{{"name": "Damage", "strong": 1, "weak": 0}}}
	}
	play(cy, "steelspell", ss("sword", "Sword", 4), 200)
	play(di, "steelspell", ss("icearrow", "Ice Arrow", 3), 200)
	byIce := newClient(t, base).call("GET", "/api/boards/steelspell/time?variant=0.2.3&filter=icearrow", nil, 200)["rows"].([]any)
	if len(byIce) != 1 || byIce[0].(map[string]any)["displayName"] != "Dina" {
		t.Fatalf("filtered: %v", byIce)
	}
	if run := byIce[0].(map[string]any)["stats"].(map[string]any); run["items"].([]any)[0].(map[string]any)["name"] != "Padded Vest" {
		t.Fatalf("row stats: %v", run)
	}
	starts := newClient(t, base).call("GET", "/api/boards/steelspell", nil, 200)["filters"].(map[string]any)["start"].([]any)
	labels := map[string]any{}
	for _, o := range starts {
		labels[o.(map[string]any)["value"].(string)] = o.(map[string]any)["label"]
	}
	if labels["icearrow"] != "Ice Arrow" || labels["sword"] != "Sword" {
		t.Fatalf("filter labels: %v", starts)
	}

	// Chronomancer's records come from its save.
	save := func(best, pool, loop int) string {
		raw, _ := json.Marshal(map[string]any{"schema": 2, "meta": map[string]any{"best": best, "eternityRecord": pool, "loop": loop, "shards": 0}})
		return string(raw)
	}
	cy.call("PUT", "/api/saves/chronoguard-v2", map[string]any{"value": save(12, 300, 4), "baseRev": 0}, 200)
	cy.call("PUT", "/api/saves/chronoguard-v2", map[string]any{"value": save(12, 300, 4), "baseRev": 1}, 200)
	cy.call("PUT", "/api/saves/chronoguard-v2", map[string]any{"value": save(14, 320, 4), "baseRev": 2}, 200)
	wave := newClient(t, base).call("GET", "/api/boards/chronomancer/wave", nil, 200)["rows"].([]any)
	if len(wave) != 1 || wave[0].(map[string]any)["value"] != 14.0 {
		t.Fatalf("chronomancer: %v", wave)
	}

	profile := newClient(t, base).call("GET", "/api/profile/cyd", nil, 200)
	if profile["displayName"] != "Cyd" || len(profile["games"].([]any)) != 4 {
		t.Fatalf("profile: %v", profile)
	}
	newClient(t, base).call("GET", "/api/profile/Unconfirmed", nil, 404)
	un.call("GET", "/api/profile/Unconfirmed", nil, 200)
}

func TestStatic(t *testing.T) {
	base, _ := setup(t)
	for path, want := range map[string]int{"/": 200, "/index.html": 200, "/nope.js": 404, "/.git/config": 404, "/api/nope": 404} {
		res, err := http.Get(base + path)
		if err != nil {
			t.Fatal(err)
		}
		res.Body.Close()
		if res.StatusCode != want {
			t.Errorf("%s: %d, want %d", path, res.StatusCode, want)
		}
	}
}

// Empty lists are lists: the pages call .map and .length on them.
func TestEmptyListsAreArrays(t *testing.T) {
	base, mails := setup(t)
	ed := signUp(t, base, mails, "ed@example.com", "Eddy", true)
	for _, path := range []string{"/api/saves", "/api/boards/tetris/score", "/api/boards/steelspell"} {
		res, _ := ed.http.Get(base + path)
		raw, _ := io.ReadAll(res.Body)
		res.Body.Close()
		if bytes.Contains(raw, []byte("null")) && !bytes.Contains(raw, []byte(`"me":null`)) {
			t.Errorf("%s: %s", path, raw)
		}
	}
}

// With many players tied, more than 100 share a rank of 100 or better; the asking
// player's row must still come back, after the first 100.
func TestMyRowAmongTies(t *testing.T) {
	base, mails := setup(t)
	me := signUp(t, base, mails, "me@example.com", "Latecomer", true)
	ctx := context.Background()
	pool, err := db.Open(ctx, os.Getenv("NEXUS_TEST_DATABASE_URL"))
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	_, err = pool.Exec(ctx, `
		WITH made AS (
		  INSERT INTO users (email, display_name, password_hash, email_verified_at)
		  SELECT 'tie' || n || '@example.com', 'Tie ' || n, 'x', now() FROM generate_series(1, 120) n
		  RETURNING id)
		INSERT INTO results (user_id, game, stats, source, created_at)
		SELECT id, 'minesweeper', '{"won":true}', 'played', now() - interval '1 day' FROM made`)
	if err != nil {
		t.Fatal(err)
	}
	id := me.call("POST", "/api/runs", map[string]string{"game": "minesweeper"}, 200)["id"].(string)
	me.call("POST", "/api/runs/"+id+"/finish", map[string]any{"stats": map[string]any{
		"won": true, "seconds": 2, "cols": 9, "rows": 9, "minePct": 16, "mode": "classic", "bbbv": 4}}, 200)
	out := me.call("GET", "/api/boards/minesweeper/wins", nil, 200)
	if rows := out["rows"].([]any); len(rows) != 100 {
		t.Fatalf("%d rows", len(rows))
	}
	mine, _ := out["me"].(map[string]any)
	if mine == nil || mine["rank"] != 1.0 || mine["displayName"] != "Latecomer" {
		t.Fatalf("my row: %v", out["me"])
	}
}
