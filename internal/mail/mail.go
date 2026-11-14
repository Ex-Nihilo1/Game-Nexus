// Package mail sends plain-text email over SMTP. With no host set it writes each
// message to the log instead, for development.
package mail

import (
	"crypto/rand"
	"crypto/tls"
	"encoding/hex"
	"fmt"
	"log"
	"mime"
	"net"
	"net/smtp"
	"strings"
	"time"
)

type Config struct {
	Host     string
	Port     int // 465 is TLS from the start; anything else upgrades with STARTTLS
	Username string
	Password string
	From     string // "Game Nexus <games@example.com>" or a bare address
}

type Sender struct{ cfg Config }

func New(cfg Config) *Sender {
	if cfg.Port == 0 {
		cfg.Port = 587
	}
	return &Sender{cfg: cfg}
}

// Send delivers one message, or logs it when no SMTP host is configured.
func (s *Sender) Send(to, subject, body string) error {
	if s.cfg.Host == "" {
		log.Printf("mail (no SMTP host set, not sent)\nTo: %s\nSubject: %s\n\n%s", to, subject, body)
		return nil
	}
	from := s.cfg.From
	fromAddr := from
	if i := strings.LastIndex(from, "<"); i >= 0 {
		fromAddr = strings.Trim(from[i:], "<>")
	}
	msg := buildMessage(from, fromAddr, to, subject, body)

	addr := net.JoinHostPort(s.cfg.Host, fmt.Sprint(s.cfg.Port))
	tlsConfig := &tls.Config{ServerName: s.cfg.Host, MinVersion: tls.VersionTLS12}
	var conn net.Conn
	var err error
	dialer := &net.Dialer{Timeout: 15 * time.Second}
	if s.cfg.Port == 465 {
		conn, err = tls.DialWithDialer(dialer, "tcp", addr, tlsConfig)
	} else {
		conn, err = dialer.Dial("tcp", addr)
	}
	if err != nil {
		return fmt.Errorf("smtp dial: %w", err)
	}
	conn.SetDeadline(time.Now().Add(30 * time.Second))
	c, err := smtp.NewClient(conn, s.cfg.Host)
	if err != nil {
		conn.Close()
		return fmt.Errorf("smtp: %w", err)
	}
	defer c.Close()
	if s.cfg.Port != 465 {
		if ok, _ := c.Extension("STARTTLS"); !ok {
			return fmt.Errorf("smtp: %s does not offer STARTTLS", s.cfg.Host)
		}
		if err := c.StartTLS(tlsConfig); err != nil {
			return fmt.Errorf("smtp starttls: %w", err)
		}
	}
	if s.cfg.Username != "" {
		if err := c.Auth(smtp.PlainAuth("", s.cfg.Username, s.cfg.Password, s.cfg.Host)); err != nil {
			return fmt.Errorf("smtp auth: %w", err)
		}
	}
	if err := c.Mail(fromAddr); err != nil {
		return fmt.Errorf("smtp from: %w", err)
	}
	if err := c.Rcpt(to); err != nil {
		return fmt.Errorf("smtp rcpt: %w", err)
	}
	w, err := c.Data()
	if err != nil {
		return fmt.Errorf("smtp data: %w", err)
	}
	if _, err := w.Write(msg); err != nil {
		return fmt.Errorf("smtp data: %w", err)
	}
	if err := w.Close(); err != nil {
		return fmt.Errorf("smtp data: %w", err)
	}
	return c.Quit()
}

func buildMessage(from, fromAddr, to, subject, body string) []byte {
	id := make([]byte, 12)
	rand.Read(id)
	domain := "localhost"
	if i := strings.LastIndex(fromAddr, "@"); i >= 0 {
		domain = fromAddr[i+1:]
	}
	var b strings.Builder
	header := func(k, v string) { fmt.Fprintf(&b, "%s: %s\r\n", k, v) }
	header("From", from)
	header("To", to)
	header("Subject", mime.QEncoding.Encode("utf-8", subject))
	header("Date", time.Now().Format(time.RFC1123Z))
	header("Message-ID", fmt.Sprintf("<%s@%s>", hex.EncodeToString(id), domain))
	header("MIME-Version", "1.0")
	header("Content-Type", "text/plain; charset=utf-8")
	header("Content-Transfer-Encoding", "8bit")
	b.WriteString("\r\n")
	b.WriteString(strings.ReplaceAll(strings.ReplaceAll(body, "\r\n", "\n"), "\n", "\r\n"))
	return []byte(b.String())
}
