package auth

import (
	"sync"
	"time"

	"golang.org/x/time/rate"
)

// Limiter keeps one token bucket per key (an IP, an email, a user id) in memory.
// Buckets that have not been used for a while are dropped.
type Limiter struct {
	mu      sync.Mutex
	every   rate.Limit
	burst   int
	buckets map[string]*bucket
}

type bucket struct {
	limiter *rate.Limiter
	seen    time.Time
}

// NewLimiter allows `burst` events at once, then one every `every`.
func NewLimiter(every time.Duration, burst int) *Limiter {
	l := &Limiter{every: rate.Every(every), burst: burst, buckets: map[string]*bucket{}}
	go l.prune()
	return l
}

// Allow takes one event from the key's bucket and reports whether there was one.
func (l *Limiter) Allow(key string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	b, ok := l.buckets[key]
	if !ok {
		b = &bucket{limiter: rate.NewLimiter(l.every, l.burst)}
		l.buckets[key] = b
	}
	b.seen = time.Now()
	return b.limiter.Allow()
}

func (l *Limiter) prune() {
	for range time.Tick(10 * time.Minute) {
		l.mu.Lock()
		for key, b := range l.buckets {
			if time.Since(b.seen) > time.Hour {
				delete(l.buckets, key)
			}
		}
		l.mu.Unlock()
	}
}
