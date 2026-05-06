package sync

import (
	"context"
	"path/filepath"
	"testing"
)

func TestLocalObjectStoreRoundTrip(t *testing.T) {
	store, err := NewLocalObjectStore(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	key := objectStorageKey("development", "obj_test")
	want := []byte("encrypted bytes")

	if err := store.Put(context.Background(), key, want); err != nil {
		t.Fatalf("Put() error = %v", err)
	}
	got, err := store.Get(context.Background(), key)
	if err != nil {
		t.Fatalf("Get() error = %v", err)
	}
	if string(got) != string(want) {
		t.Fatalf("payload = %q, want %q", got, want)
	}
}

func TestLocalObjectStoreRejectsTraversal(t *testing.T) {
	store, err := NewLocalObjectStore(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	keys := []string{
		"../escape",
		"/absolute",
		"..",
		filepath.ToSlash(filepath.Join("sync", "..", "..", "escape")),
	}
	for _, key := range keys {
		if err := store.Put(context.Background(), key, []byte("x")); err == nil {
			t.Fatalf("Put(%q) error = nil, want traversal rejection", key)
		}
	}
}
