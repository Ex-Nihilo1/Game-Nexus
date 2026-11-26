package auth

import (
	"bytes"
	"testing"
	"time"
)

func TestTokens(t *testing.T) {
	a, hashA, err := NewToken()
	if err != nil {
		t.Fatal(err)
	}
	b, _, _ := NewToken()
	if a == b || len(a) != 43 {
		t.Fatalf("tokens %q %q", a, b)
	}
	if !bytes.Equal(HashToken(a), hashA) {
		t.Fatal("HashToken differs from the hash NewToken returned")
	}
}

func TestLimiter(t *testing.T) {
	l := NewLimiter(time.Hour, 3)
	for i := 0; i < 3; i++ {
		if !l.Allow("a") {
			t.Fatalf("event %d refused", i)
		}
	}
	if l.Allow("a") {
		t.Fatal("fourth event allowed")
	}
	if !l.Allow("b") {
		t.Fatal("another key shares the bucket")
	}
}
