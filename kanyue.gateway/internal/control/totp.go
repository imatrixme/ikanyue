package control

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha1"
	"crypto/subtle"
	"encoding/base32"
	"encoding/binary"
	"errors"
	"fmt"
	"net/url"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/security"

	"kanyue.gateway/internal/schema"
)

// Superusers sign in with their password and then a one-time code. PocketBase
// generates and would email that code; the gateway never sends it and instead
// accepts the current code of the superuser's enrolled TOTP authenticator
// (RFC 6238: SHA-1, 6 digits, 30 seconds, one step of clock drift).
const (
	totpStep   = 30
	totpDigits = 6
)

var totpEncoding = base32.StdEncoding.WithPadding(base32.NoPadding)

func totpCode(secret []byte, step int64) string {
	mac := hmac.New(sha1.New, secret)
	binary.Write(mac, binary.BigEndian, step)
	sum := mac.Sum(nil)
	offset := sum[len(sum)-1] & 0x0f
	value := binary.BigEndian.Uint32(sum[offset:offset+4]) & 0x7fffffff
	return fmt.Sprintf("%0*d", totpDigits, value%1_000_000)
}

// matchTOTP returns the step code matches within one step of now, or 0.
func matchTOTP(secret []byte, code string, now time.Time) int64 {
	current := now.Unix() / totpStep
	for _, step := range []int64{current, current - 1, current + 1} {
		if subtle.ConstantTimeCompare([]byte(totpCode(secret, step)), []byte(code)) == 1 {
			return step
		}
	}
	return 0
}

// EnrollTOTP gives the superuser with email a new authenticator secret and
// returns its otpauth:// URI, to be shown once to the operator.
func (c *Control) EnrollTOTP(email string) (string, error) {
	superuser, err := c.app.FindAuthRecordByEmail(core.CollectionNameSuperusers, email)
	if err != nil {
		return "", fmt.Errorf("no superuser %q", email)
	}
	raw := make([]byte, 20)
	if _, err := rand.Read(raw); err != nil {
		return "", err
	}
	secret := totpEncoding.EncodeToString(raw)
	collection, err := c.app.FindCollectionByNameOrId(schema.SuperuserTOTP)
	if err != nil {
		return "", err
	}
	record, err := c.app.FindFirstRecordByData(schema.SuperuserTOTP, "superuser", superuser.Id)
	if err != nil {
		record = core.NewRecord(collection)
		record.Set("superuser", superuser.Id)
	}
	record.Set("secret", secret)
	record.Set("lastStep", 0)
	if err := c.app.Save(record); err != nil {
		return "", err
	}
	query := url.Values{"secret": {secret}, "issuer": {"kanyue.gateway"}, "digits": {fmt.Sprint(totpDigits)}, "period": {fmt.Sprint(totpStep)}}
	return "otpauth://totp/kanyue.gateway:" + url.PathEscape(email) + "?" + query.Encode(), nil
}

// RemoveTOTP drops the authenticator of the superuser with email; that superuser can no longer sign in until enrolled again.
func (c *Control) RemoveTOTP(email string) error {
	superuser, err := c.app.FindAuthRecordByEmail(core.CollectionNameSuperusers, email)
	if err != nil {
		return fmt.Errorf("no superuser %q", email)
	}
	_, err = c.app.DB().Delete(schema.SuperuserTOTP, dbx.HashExp{"superuser": superuser.Id}).Execute()
	return err
}

// checkTOTP sets the pending code's password to the submitted value when it is
// the superuser's current, unused TOTP code, and to an unguessable value
// otherwise; PocketBase's own handler then compares and rate limits as usual.
func (c *Control) checkTOTP(e *core.RequestEvent) error {
	collection, err := c.app.FindCachedCollectionByNameOrId(e.Request.PathValue("collection"))
	if err != nil || collection.Name != core.CollectionNameSuperusers {
		return e.Next()
	}
	var form struct {
		OTPId    string `json:"otpId" form:"otpId"`
		Password string `json:"password" form:"password"`
	}
	if err := e.BindBody(&form); err != nil || form.OTPId == "" {
		return e.Next()
	}
	otp, err := c.app.FindOTPById(form.OTPId)
	if err != nil || otp.CollectionRef() != collection.Id {
		return e.Next()
	}
	password := security.RandomString(40)
	if step, err := c.verifyTOTP(otp.RecordRef(), form.Password); err == nil {
		password = form.Password
		c.app.Logger().Info("Superuser TOTP accepted", "superuser", otp.RecordRef(), "step", step)
	} else {
		c.app.Logger().Warn("Superuser TOTP refused", "superuser", otp.RecordRef(), "reason", err.Error())
	}
	otp.SetPassword(password)
	if err := c.app.Save(otp); err != nil {
		return err
	}
	return e.Next()
}

func (c *Control) verifyTOTP(superuser, code string) (int64, error) {
	record, err := c.app.FindFirstRecordByData(schema.SuperuserTOTP, "superuser", superuser)
	if err != nil {
		return 0, errors.New("no authenticator enrolled; run `kanyue-gateway totp enroll <email> --encryptionEnv=GATEWAY_ENCRYPTION_KEY` on the server")
	}
	secret, err := c.open(record.GetString("secret"))
	if err != nil {
		return 0, err
	}
	raw, err := totpEncoding.DecodeString(secret)
	if err != nil {
		return 0, err
	}
	step := matchTOTP(raw, code, time.Now())
	if step == 0 {
		return 0, errors.New("wrong code")
	}
	if step <= int64(record.GetInt("lastStep")) {
		return 0, errors.New("code already used")
	}
	record.Set("lastStep", step)
	return step, c.app.Save(record)
}

func (c *Control) bindTOTP() {
	// The generated code would be a second, emailed way in; it is never sent.
	c.app.OnMailerRecordOTPSend(core.CollectionNameSuperusers).BindFunc(func(e *core.MailerRecordEvent) error {
		return nil
	})
}
