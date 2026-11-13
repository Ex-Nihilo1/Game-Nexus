package main

import (
	"reflect"
	"strings"
	"testing"
	"time"
	"unicode/utf8"
)

// Made-up results must pass the same checks real games do, or the boards would show
// something real play cannot produce.
func TestEveryResultPassesTheGamesChecks(t *testing.T) {
	now := time.Now()
	for seed := int64(1); seed <= 5; seed++ {
		for _, p := range generate(seed, 200, now) {
			for _, res := range p.results {
				out, _, err := outcome(res)
				if err != nil {
					t.Fatalf("seed %d, %s, %s %s: %v", seed, p.name, res.game, res.stats, err)
				}
				if out == nil {
					t.Fatalf("seed %d, %s: %s save made no result", seed, p.name, res.game)
				}
				if res.at.Before(p.joined) || res.at.After(now) {
					t.Fatalf("%s played %s at %v, joined %v", p.name, res.game, res.at, p.joined)
				}
			}
		}
	}
}

func TestNamesAreUniqueAndValid(t *testing.T) {
	seen := map[string]bool{}
	for _, p := range generate(1, 300, time.Now()) {
		key := strings.ToLower(p.name)
		if seen[key] {
			t.Fatalf("%s twice", p.name)
		}
		seen[key] = true
		if n := utf8.RuneCountInString(p.name); n < 3 || n > 24 {
			t.Fatalf("%q is %d characters", p.name, n)
		}
	}
}

func TestSameSeedSamePlayers(t *testing.T) {
	now := time.Now()
	if !reflect.DeepEqual(generate(7, 50, now), generate(7, 50, now)) {
		t.Fatal("one seed made two different sets of players")
	}
}
