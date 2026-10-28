package control

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"maps"
	"os"
	"slices"
	"strings"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/security"

	"kanyue.gateway/internal/schema"
)

// sealedPrefix marks a stored value as ciphertext, so an update that leaves the
// field alone never seals it twice.
const sealedPrefix = "enc:v1:"

// sealedFields are the secret fields per collection; they are hidden from the API
// and the audit log, and stored sealed with the --encryptionEnv key.
var sealedFields = map[string]string{schema.Secrets: "value", schema.Consumers: "appSecret", schema.SuperuserTOTP: "secret",
	schema.Exporters: "secret", schema.AlertChannels: "secret"}

// masterKey is the AES-256 key named by --encryptionEnv; it never enters the database.
func (c *Control) masterKey() (string, error) {
	name := c.app.EncryptionEnv()
	if name == "" {
		return "", errors.New("no encryption key; start the gateway with --encryptionEnv")
	}
	key := os.Getenv(name)
	if len(key) != 32 {
		return "", fmt.Errorf("%s must hold a 32 character key", name)
	}
	return key, nil
}

func (c *Control) seal(plain string) (string, error) {
	key, err := c.masterKey()
	if err != nil {
		return "", err
	}
	sealed, err := security.Encrypt([]byte(plain), key)
	if err != nil {
		return "", err
	}
	return sealedPrefix + sealed, nil
}

func (c *Control) open(sealed string) (string, error) {
	if !strings.HasPrefix(sealed, sealedPrefix) {
		return "", errors.New("value is not sealed")
	}
	key, err := c.masterKey()
	if err != nil {
		return "", err
	}
	plain, err := security.Decrypt(strings.TrimPrefix(sealed, sealedPrefix), key)
	if err != nil {
		return "", errors.New("cannot decrypt; was the encryption key changed?")
	}
	return string(plain), nil
}

// fingerprint identifies a secret without revealing it.
func fingerprint(plain string) string {
	sum := sha256.Sum256([]byte("kanyue.gateway fingerprint\x00" + plain))
	return hex.EncodeToString(sum[:6])
}

func (c *Control) bindSealing() {
	sealRecord := func(e *core.RecordEvent) error {
		field := sealedFields[e.Record.Collection().Name]
		value := e.Record.GetString(field)
		if value != "" && !strings.HasPrefix(value, sealedPrefix) {
			sealed, err := c.seal(value)
			if err != nil {
				return err
			}
			e.Record.Set(field, sealed)
			e.Record.Set("fingerprint", fingerprint(value))
		}
		return e.Next()
	}
	sealed := slices.Sorted(maps.Keys(sealedFields))
	c.app.OnRecordCreate(sealed...).BindFunc(sealRecord)
	c.app.OnRecordUpdate(sealed...).BindFunc(sealRecord)
}
