package control

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/security"

	"kanyue.gateway/internal/policy"
)

var errDataDirBusy = errors.New("a gateway is serving this data directory, or a key rotation is running; stop it first")

// sealedValue matches one sealed secret wherever it is stored: a secret field,
// or inside a released configuration or a last-known-good file.
var sealedValue = regexp.MustCompile(regexp.QuoteMeta(sealedPrefix) + `[A-Za-z0-9+/]+={0,2}`)

// Rotation counts what a key rotation re-sealed; it never carries secret values.
type Rotation struct {
	Backup  string         `json:"backup"`
	Values  int            `json:"values"`
	Already int            `json:"already"` // sealed with the new key by an interrupted earlier run
	Fields  map[string]int `json:"fields"`  // collection.field → values
	Files   int            `json:"files"`
}

type resealedField struct {
	table, field, id, value string
}

// RotateKey re-seals every stored secret, the PocketBase settings and the
// last-known-good files from the key named by --encryptionEnv to the key in
// newKeyEnv. Nothing is written unless every value opens with one of the two
// keys; values already sealed with the new key are kept, so an interrupted
// rotation can be run again. Afterwards start the gateway with the new key.
func (c *Control) RotateKey(newKeyEnv string) (Rotation, error) {
	report := Rotation{Fields: map[string]int{}}
	oldKey, err := c.masterKey()
	if err != nil {
		return report, err
	}
	newKey := os.Getenv(newKeyEnv)
	switch {
	case len(newKey) != 32:
		return report, fmt.Errorf("%s must hold a 32 character key", newKeyEnv)
	case newKey == oldKey:
		return report, errors.New("the new key equals the current key")
	}
	lock, err := lockDataDir(c.app.DataDir(), true)
	if err != nil {
		return report, err
	}
	if lock != nil {
		defer lock.Close()
	}

	reseal := func(text string) (string, error) {
		var failure error
		out := sealedValue.ReplaceAllStringFunc(text, func(sealed string) string {
			cipher := sealed[len(sealedPrefix):]
			if _, err := security.Decrypt(cipher, newKey); err == nil {
				report.Already++
				return sealed
			}
			plain, err := security.Decrypt(cipher, oldKey)
			if err != nil {
				failure = errors.New("a value opens with neither key")
				return sealed
			}
			again, err := security.Encrypt(plain, newKey)
			if err != nil {
				failure = err
				return sealed
			}
			report.Values++
			return sealedPrefix + again
		})
		return out, failure
	}

	// Everything is re-sealed in memory first; a value that opens with
	// neither key stops the rotation before anything is written.
	updates, err := c.resealRecords(reseal, report.Fields)
	if err != nil {
		return report, err
	}
	files := map[string][]byte{}
	for _, name := range append(lastKnownGoodFiles(c.app.DataDir()), filepath.Join(c.app.DataDir(), "gateway-snapshot.json")) {
		raw, err := os.ReadFile(name)
		if errors.Is(err, os.ErrNotExist) {
			continue
		}
		if err != nil {
			return report, err
		}
		out, err := reseal(string(raw))
		if err != nil {
			return report, fmt.Errorf("%s: %w", filepath.Base(name), err)
		}
		files[name] = []byte(out)
	}

	report.Backup = fmt.Sprintf("pre-rotate-key-%s.zip", time.Now().UTC().Format("20060102-150405"))
	if err := c.app.CreateBackup(context.Background(), report.Backup); err != nil {
		return report, fmt.Errorf("backup before rotating: %w", err)
	}

	// PocketBase seals its settings with the key named by --encryptionEnv, so
	// that name points at the new key from here on.
	keyEnv := c.app.EncryptionEnv()
	err = c.app.RunInTransaction(func(tx core.App) error {
		for _, u := range updates {
			if _, err := tx.DB().Update(u.table, dbx.Params{u.field: u.value}, dbx.HashExp{"id": u.id}).Execute(); err != nil {
				return fmt.Errorf("%s.%s: %w", u.table, u.field, err)
			}
		}
		os.Setenv(keyEnv, newKey)
		return tx.Save(c.app.Settings())
	})
	if err != nil {
		os.Setenv(keyEnv, oldKey)
		return report, err
	}
	for name, raw := range files {
		if err := os.WriteFile(name+".tmp", raw, 0o600); err != nil {
			return report, fmt.Errorf("%s: %w; run the rotation again", filepath.Base(name), err)
		}
		if err := os.Rename(name+".tmp", name); err != nil {
			return report, fmt.Errorf("%s: %w; run the rotation again", filepath.Base(name), err)
		}
		report.Files++
	}
	c.audit("cli", "rotate-key", "", "", map[string]any{"backup": report.Backup, "values": report.Values,
		"already": report.Already, "fields": report.Fields, "files": report.Files})

	// Every released environment must compile with the new key.
	for _, stage := range policy.Stages {
		if _, err := c.loadStage(stage); err != nil && !errors.Is(err, errNoVersion) {
			return report, fmt.Errorf("%s does not compile with the new key: %w", stage, err)
		}
	}
	return report, nil
}

// resealRecords re-seals the sealed values of every text and JSON field, in
// memory; it reads raw columns so append-only collections are covered too.
func (c *Control) resealRecords(reseal func(string) (string, error), fields map[string]int) ([]resealedField, error) {
	collections, err := c.app.FindAllCollections(core.CollectionTypeBase, core.CollectionTypeAuth)
	if err != nil {
		return nil, err
	}
	var updates []resealedField
	for _, collection := range collections {
		for _, field := range collection.Fields {
			if field.Type() != core.FieldTypeText && field.Type() != core.FieldTypeJSON {
				continue
			}
			var rows []struct {
				ID    string `db:"id"`
				Value string `db:"value"`
			}
			err := c.app.DB().Select("id", field.GetName()+" AS value").From(collection.Name).
				Where(dbx.Like(field.GetName(), sealedPrefix)).All(&rows)
			if err != nil {
				return nil, fmt.Errorf("%s.%s: %w", collection.Name, field.GetName(), err)
			}
			for _, row := range rows {
				value, err := reseal(row.Value)
				if err != nil {
					return nil, fmt.Errorf("%s.%s of %s: %w", collection.Name, field.GetName(), row.ID, err)
				}
				if value != row.Value {
					updates = append(updates, resealedField{collection.Name, field.GetName(), row.ID, value})
					fields[collection.Name+"."+field.GetName()]++
				}
			}
		}
	}
	return updates, nil
}

func lastKnownGoodFiles(dataDir string) []string {
	var names []string
	for _, stage := range policy.Stages {
		names = append(names, lastKnownGoodFile(dataDir, stage))
	}
	return names
}
