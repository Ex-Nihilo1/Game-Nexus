package auth

import (
	"bytes"
	"testing"
	"time"
)

func TestPasswordRoundTrip(t *testing.T) {
	hash, err := HashPassword("correct horse battery")
	if err != nil {
		t.Fatal(err)
	}
	if ok, err := CheckPassword(hash, "correct horse battery"); !ok || err != nil {
		t.Fatalf("right password rejected: %v %v", ok, err)
	}
	if ok, _ := CheckPassword(hash, "correct horse batterY"); ok {
		t.Fatal("wrong password accepted")
	}
	other, _ := HashPassword("correct horse battery")
	if other == hash {
		t.Fatal("two hashes of one password share a salt")
	}
}

func TestCheckPasswordRejectsJunk(t *testing.T) {
	for _, hash := range []string{"", "plain", "$argon2i$v=19$m=1,t=1,p=1$AA$AA", "$argon2id$v=19$m=x$AA$AA"} {
		if ok, err := CheckPassword(hash, "x"); ok || err == nil {
			t.Errorf("%q: ok=%v err=%v", hash, ok, err)
		}
	}
}

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
