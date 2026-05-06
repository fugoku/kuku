package sync

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/google/uuid"

	syncv1 "github.com/kuku-mom/kuku/packages/contract/gen/go/kuku/sync/v1"

	"github.com/kuku-mom/kuku/apps/server/internal/config"
	"github.com/kuku-mom/kuku/apps/server/internal/database"
	"github.com/kuku-mom/kuku/apps/server/internal/database/sqlc"
)

func TestServiceIntegrationLocalMetadataRoundTrip(t *testing.T) {
	databaseURL := os.Getenv("KUKU_TEST_DATABASE_URL")
	if databaseURL == "" {
		t.Skip("KUKU_TEST_DATABASE_URL is not set")
	}

	ctx := context.Background()
	pool, err := database.NewPool(ctx, databaseURL)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	migrationsDir := filepath.Join("..", "..", "sql", "migrations")
	if err := database.RunMigrations(ctx, pool, migrationsDir); err != nil {
		t.Fatal(err)
	}

	queries := sqlc.New(pool)
	user, err := queries.CreateUser(ctx, sqlc.CreateUserParams{
		Email:            "sync-" + uuid.NewString() + "@example.com",
		Name:             "Sync Test",
		EmailConfirmedAt: database.Timestamptz(time.Now().UTC()),
	})
	if err != nil {
		t.Fatal(err)
	}
	otherUser, err := queries.CreateUser(ctx, sqlc.CreateUserParams{
		Email:            "sync-other-" + uuid.NewString() + "@example.com",
		Name:             "Other Sync Test",
		EmailConfirmedAt: database.Timestamptz(time.Now().UTC()),
	})
	if err != nil {
		t.Fatal(err)
	}

	cfg := &config.Config{
		Env:                             "test",
		SyncDirectBytesDevEnabled:       true,
		SyncObjectStoreDriver:           "local",
		SyncLocalObjectDir:              t.TempDir(),
		SyncMaxWorkspacesPerUser:        5,
		SyncMaxTotalStorageBytesPerUser: 1024 * 1024,
		SyncMaxStorageBytesPerWorkspace: 1024 * 1024,
		SyncMaxSingleBlobBytes:          1024 * 1024,
		SyncMaxPendingUploadBytes:       1024 * 1024,
		SyncMaxPendingUploadAge:         24 * time.Hour,
	}
	store, err := NewObjectStore(cfg)
	if err != nil {
		t.Fatal(err)
	}
	service := NewService(pool, queries, cfg, store)

	workspace, err := service.CreateWorkspace(ctx, user.ID, "kuku-sync-v1")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := service.GetWorkspace(ctx, otherUser.ID, workspace.ID); !errors.Is(err, ErrPermissionDenied) {
		t.Fatalf("other user GetWorkspace error = %v, want ErrPermissionDenied", err)
	}
	device, err := service.RegisterDevice(ctx, user.ID, workspace.ID, []byte("signing-key"), nil, []byte("encrypted-name"))
	if err != nil {
		t.Fatal(err)
	}
	envelope, err := service.PutKeyEnvelope(ctx, user.ID, PutKeyEnvelopeParams{
		WorkspaceID:       workspace.ID,
		EnvelopeID:        "passphrase:v1",
		RecipientType:     syncv1.SyncKeyRecipientType_SYNC_KEY_RECIPIENT_TYPE_PASSPHRASE,
		KeyVersion:        1,
		KDFParamsJSON:     `{"name":"argon2id"}`,
		EncryptedEnvelope: []byte("encrypted-envelope"),
		CreatedByDeviceID: device.ID,
	})
	if err != nil {
		t.Fatal(err)
	}
	if envelope.EnvelopeID != "passphrase:v1" {
		t.Fatalf("envelope id = %q", envelope.EnvelopeID)
	}
	envelopes, err := service.ListKeyEnvelopes(ctx, user.ID, workspace.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(envelopes) != 1 {
		t.Fatalf("len(envelopes) = %d, want 1", len(envelopes))
	}

	reserved, err := service.ReserveObjectIDs(ctx, user.ID, workspace.ID, device.ID, []ObjectReservationRequest{{
		ClientObjectRef: "local-1",
		Kind:            syncv1.SyncObjectKind_SYNC_OBJECT_KIND_COMMIT_BODY,
	}})
	if err != nil {
		t.Fatal(err)
	}
	if len(reserved) != 1 || reserved[0].Object.ObjectID == "" {
		t.Fatalf("reserved object missing: %+v", reserved)
	}
	if reserved[0].Object.StorageKey == "" || reserved[0].Object.StorageKey == reserved[0].Object.ObjectID {
		t.Fatalf("storage key not set correctly: %+v", reserved[0].Object)
	}

	payload := []byte("encrypted blob")
	sum := sha256.Sum256(payload)
	uploaded, err := service.UploadObjectBytesDev(ctx, user.ID, workspace.ID, device.ID, reserved[0].Object.ObjectID, hex.EncodeToString(sum[:]), int64(len(payload)), payload)
	if err != nil {
		t.Fatal(err)
	}
	if uploaded.UploadState != sqlc.KukuSyncObjectStateAvailable {
		t.Fatalf("upload state = %s", uploaded.UploadState)
	}
	downloadedObject, downloaded, err := service.DownloadObjectBytesDev(ctx, user.ID, workspace.ID, device.ID, reserved[0].Object.ObjectID)
	if err != nil {
		t.Fatal(err)
	}
	if downloadedObject.ObjectID != uploaded.ObjectID || string(downloaded) != string(payload) {
		t.Fatalf("download mismatch: object=%+v payload=%q", downloadedObject, downloaded)
	}
}
