package sync

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"fmt"
	"strings"
	"unicode"

	"github.com/kuku-mom/kuku/apps/server/internal/config"
	"github.com/kuku-mom/kuku/apps/server/internal/database/sqlc"
)

type ObjectStore interface {
	Provider() sqlc.KukuSyncStorageProvider
	Put(ctx context.Context, storageKey string, payload []byte) error
	Get(ctx context.Context, storageKey string) ([]byte, error)
}

func NewObjectStore(cfg *config.Config) (ObjectStore, error) {
	switch cfg.SyncObjectStoreDriver {
	case "local":
		return NewLocalObjectStore(cfg.SyncLocalObjectDir)
	case "s3", "s3_compatible":
		return nil, fmt.Errorf("%w: %s", ErrNotImplemented, cfg.SyncObjectStoreDriver)
	default:
		return nil, fmt.Errorf("%w: unsupported object store driver %q", ErrInvalidArgument, cfg.SyncObjectStoreDriver)
	}
}

func newObjectID() (string, error) {
	var raw [18]byte
	if _, err := rand.Read(raw[:]); err != nil {
		return "", err
	}
	return "obj_" + base64.RawURLEncoding.EncodeToString(raw[:]), nil
}

func objectStorageKey(env, objectID string) string {
	return fmt.Sprintf("sync/%s/objects/%s", storageNamespace(env), objectID)
}

func storageNamespace(env string) string {
	env = strings.TrimSpace(env)
	if env == "" {
		return "development"
	}
	var b strings.Builder
	for _, r := range env {
		switch {
		case r == '-' || r == '_':
			b.WriteRune(r)
		case unicode.IsLetter(r) || unicode.IsDigit(r):
			b.WriteRune(unicode.ToLower(r))
		default:
			b.WriteRune('-')
		}
	}
	out := strings.Trim(b.String(), "-_")
	if out == "" {
		return "development"
	}
	return out
}
