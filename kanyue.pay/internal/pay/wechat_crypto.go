package pay

import (
	"crypto"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"
)

// Credentials are the merchant identity and pinned WeChat platform keys.
type Credentials struct {
	AppID      string
	MerchantID string
	Serial     string
	PrivateKey *rsa.PrivateKey
	PublicKeys map[string]*rsa.PublicKey
	APIV3Key   []byte
	NotifyURL  string
}

func seconds() int64 { return time.Now().Unix() }

func nonce() string {
	random := make([]byte, 16)
	rand.Read(random)
	return hex.EncodeToString(random)
}

func rsaSign(message string, key *rsa.PrivateKey) string {
	sum := sha256.Sum256([]byte(message))
	signature, err := rsa.SignPKCS1v15(rand.Reader, key, crypto.SHA256, sum[:])
	if err != nil {
		panic(err)
	}
	return base64.StdEncoding.EncodeToString(signature)
}

var base64Pattern = regexp.MustCompile(`^[A-Za-z0-9+/]+={0,2}$`)

func verifyMessage(message, signature string, key *rsa.PublicKey) error {
	if base64Pattern.MatchString(signature) {
		if raw, err := base64.StdEncoding.DecodeString(signature); err == nil {
			sum := sha256.Sum256([]byte(message))
			if rsa.VerifyPKCS1v15(key, crypto.SHA256, sum[:], raw) == nil {
				return nil
			}
		}
	}
	return fail("WECHAT_SIGNATURE_INVALID", 401)
}

func authorization(method string, target *url.URL, body string, credentials *Credentials) string {
	timestamp, random := strconv.FormatInt(seconds(), 10), nonce()
	signature := rsaSign(fmt.Sprintf("%s\n%s\n%s\n%s\n%s\n", method, requestURI(target), timestamp, random, body), credentials.PrivateKey)
	return fmt.Sprintf(`WECHATPAY2-SHA256-RSA2048 mchid="%s",nonce_str="%s",timestamp="%s",serial_no="%s",signature="%s"`,
		credentials.MerchantID, random, timestamp, credentials.Serial, signature)
}

// requestURI is pathname plus search, as WeChat signs it.
func requestURI(target *url.URL) string {
	if target.RawQuery == "" {
		return target.EscapedPath()
	}
	return target.EscapedPath() + "?" + target.RawQuery
}

var timestampPattern = regexp.MustCompile(`^\d{10}$`)

// verifyResponse checks a WeChat platform signature over the exact response bytes.
func verifyResponse(headers http.Header, body string, keys map[string]*rsa.PublicKey, now int64) error {
	key, ok := keys[headers.Get("Wechatpay-Serial")]
	if !ok {
		return fail("WECHAT_UNKNOWN_SIGNING_KEY", 401)
	}
	timestamp, random := headers.Get("Wechatpay-Timestamp"), headers.Get("Wechatpay-Nonce")
	at, _ := strconv.ParseInt(timestamp, 10, 64)
	if !timestampPattern.MatchString(timestamp) || now-at > 300 || at-now > 300 {
		return fail("WECHAT_STALE_SIGNATURE", 401)
	}
	if random == "" || len(random) > 128 || strings.ContainsAny(random, "\r\n") {
		return fail("WECHAT_INVALID_NONCE", 401)
	}
	return verifyMessage(fmt.Sprintf("%s\n%s\n%s\n", timestamp, random, body), headers.Get("Wechatpay-Signature"), key)
}

var prepayPattern = regexp.MustCompile(`^\w{1,64}$`)

// launchParameters are the signed small-program requestPayment arguments.
func launchParameters(prepayID string, credentials *Credentials) (map[string]any, error) {
	if !prepayPattern.MatchString(prepayID) {
		return nil, fail("WECHAT_INVALID_PREPAY_ID", 502)
	}
	timeStamp, nonceStr, packageValue := strconv.FormatInt(seconds(), 10), nonce(), "prepay_id="+prepayID
	return map[string]any{"appId": credentials.AppID, "timeStamp": timeStamp, "nonceStr": nonceStr,
		"package": packageValue, "signType": "RSA",
		"paySign": rsaSign(fmt.Sprintf("%s\n%s\n%s\n%s\n", credentials.AppID, timeStamp, nonceStr, packageValue), credentials.PrivateKey)}, nil
}

type notification struct {
	ID   string
	Type string
	Data any
}

func decodeNotification(headers http.Header, raw string, credentials *Credentials) (notification, error) {
	if err := verifyResponse(headers, raw, credentials.PublicKeys, seconds()); err != nil {
		return notification{}, err
	}
	var envelope map[string]any
	if err := json.Unmarshal([]byte(raw), &envelope); err != nil {
		return notification{}, fail("INVALID_JSON", 400)
	}
	resource := mapOf(envelope["resource"])
	id, idOK := envelope["id"].(string)
	if envelope["resource_type"] != "encrypt-resource" || !idOK || resource["algorithm"] != "AEAD_AES_256_GCM" {
		return notification{}, fail("WECHAT_INVALID_NOTIFICATION", 400)
	}
	nonceValue, nonceOK := resource["nonce"].(string)
	encoded, cipherOK := resource["ciphertext"].(string)
	associated, associatedOK := resource["associated_data"].(string)
	if _, present := resource["associated_data"]; !present {
		associatedOK = true
	}
	if len(credentials.APIV3Key) != 32 || !nonceOK || len(nonceValue) != 12 || !cipherOK || !associatedOK {
		return notification{}, fail("WECHAT_INVALID_RESOURCE", 400)
	}
	ciphertext, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil || len(ciphertext) <= 16 {
		return notification{}, fail("WECHAT_INVALID_CIPHERTEXT", 400)
	}
	failed := errors.New("WECHAT_NOTIFICATION_DECRYPTION_FAILED")
	block, err := aes.NewCipher(credentials.APIV3Key)
	if err != nil {
		return notification{}, failed
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return notification{}, failed
	}
	plaintext, err := gcm.Open(nil, []byte(nonceValue), ciphertext, []byte(associated))
	if err != nil {
		return notification{}, failed
	}
	var data any
	if err := json.Unmarshal(plaintext, &data); err != nil {
		return notification{}, failed
	}
	kind, _ := envelope["event_type"].(string)
	return notification{ID: id, Type: kind, Data: data}, nil
}

func encrypt(key []byte, nonceValue, associated string, plaintext []byte) string {
	block, err := aes.NewCipher(key)
	if err != nil {
		panic(err)
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		panic(err)
	}
	return base64.StdEncoding.EncodeToString(gcm.Seal(nil, []byte(nonceValue), plaintext, []byte(associated)))
}
