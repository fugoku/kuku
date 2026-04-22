package auth

import (
	"context"
	"log/slog"
	"net/smtp"
	"strings"

	"github.com/kuku-mom/kuku/apps/server/internal/config"
)

type SMTPEmailSender struct {
	cfg *config.Config
	log *slog.Logger
}

func NewSMTPEmailSender(cfg *config.Config, log *slog.Logger) *SMTPEmailSender {
	return &SMTPEmailSender{cfg: cfg, log: log}
}

func (s *SMTPEmailSender) SendAuthCode(ctx context.Context, to, code string) error {
	select {
	case <-ctx.Done():
		return ctx.Err()
	default:
	}

	addr := s.cfg.SMTPAddress()
	from := s.cfg.EmailFromAddress
	message := strings.Join([]string{
		"From: " + s.cfg.EmailFromName + " <" + from + ">",
		"To: " + to,
		"Subject: " + emailSubject,
		"MIME-Version: 1.0",
		"Content-Type: text/plain; charset=UTF-8",
		"",
		emailBody(code),
	}, "\r\n")

	var auth smtp.Auth
	if s.cfg.SMTPUsername != "" || s.cfg.SMTPPassword != "" {
		auth = smtp.PlainAuth("", s.cfg.SMTPUsername, s.cfg.SMTPPassword, s.cfg.SMTPHost)
	}
	if err := smtp.SendMail(addr, auth, from, []string{to}, []byte(message)); err != nil {
		return err
	}
	s.log.Debug("sent email auth code via smtp")
	return nil
}
