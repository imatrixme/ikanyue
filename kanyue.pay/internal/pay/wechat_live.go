package pay

import (
	"crypto/rsa"
	"crypto/x509"
	"encoding/json"
	"encoding/pem"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"strings"
	"time"
)

func secretFile(path string) ([]byte, error) {
	if !strings.HasPrefix(path, "/") {
		return nil, fail("ABSOLUTE_CREDENTIAL_PATH_REQUIRED", 400)
	}
	info, err := os.Stat(path)
	if err != nil {
		return nil, err
	}
	if !info.Mode().IsRegular() || info.Mode().Perm()&0o077 != 0 || info.Size() > 65536 {
		return nil, fail("CREDENTIAL_FILE_PERMISSIONS", 400)
	}
	return os.ReadFile(path)
}

func pemBlock(raw []byte) []byte {
	if block, _ := pem.Decode(raw); block != nil {
		return block.Bytes
	}
	return nil
}

func rsaPublicKey(raw []byte) (*rsa.PublicKey, error) {
	key, err := x509.ParsePKIXPublicKey(pemBlock(raw))
	if err != nil {
		return nil, err
	}
	public, ok := key.(*rsa.PublicKey)
	if !ok || public.N.BitLen() < 2048 {
		return nil, fail("WECHAT_RSA_KEY_REQUIRED", 400)
	}
	return public, nil
}

var (
	appIDPattern       = regexp.MustCompile(`^wx[a-f0-9]{16}$`)
	merchantIDPattern  = regexp.MustCompile(`^\d{8,10}$`)
	serialPattern      = regexp.MustCompile(`^[A-Fa-f0-9]{16,64}$`)
	platformKeyPattern = regexp.MustCompile(`^PUB_KEY_ID_[A-Za-z0-9_]+$`)
)

// LiveCredentials loads protected merchant credentials and up to five pinned platform keys.
func LiveCredentials(path string) (*Credentials, error) {
	raw, err := secretFile(path)
	if err != nil {
		return nil, err
	}
	var data struct {
		AppID           string            `json:"appId"`
		MerchantID      string            `json:"merchantId"`
		Serial          string            `json:"serial"`
		PrivateKeyFile  string            `json:"privateKeyFile"`
		CertificateFile string            `json:"certificateFile"`
		PublicKeyFiles  map[string]string `json:"publicKeyFiles"`
		APIV3KeyFile    string            `json:"apiV3KeyFile"`
		NotifyURL       string            `json:"notifyUrl"`
	}
	if err := json.Unmarshal(raw, &data); err != nil {
		return nil, err
	}
	if !appIDPattern.MatchString(data.AppID) || !merchantIDPattern.MatchString(data.MerchantID) || !serialPattern.MatchString(data.Serial) {
		return nil, fail("WECHAT_IDENTITY_CONFIGURATION", 400)
	}
	privatePEM, err := secretFile(data.PrivateKeyFile)
	if err != nil {
		return nil, err
	}
	var privateKey *rsa.PrivateKey
	if parsed, err := x509.ParsePKCS8PrivateKey(pemBlock(privatePEM)); err == nil {
		privateKey, _ = parsed.(*rsa.PrivateKey)
	} else if parsed, err := x509.ParsePKCS1PrivateKey(pemBlock(privatePEM)); err == nil {
		privateKey = parsed
	}
	if privateKey == nil || privateKey.N.BitLen() < 2048 {
		return nil, fail("WECHAT_RSA_KEY_REQUIRED", 400)
	}
	certificatePEM, err := secretFile(data.CertificateFile)
	if err != nil {
		return nil, err
	}
	certificate, err := x509.ParseCertificate(pemBlock(certificatePEM))
	invalid := fail("WECHAT_MERCHANT_CERTIFICATE_INVALID", 400)
	if err != nil {
		return nil, invalid
	}
	public, ok := certificate.PublicKey.(*rsa.PublicKey)
	serial := strings.TrimLeft(strings.ToLower(certificate.SerialNumber.Text(16)), "0")
	now := time.Now()
	if !ok || !public.Equal(&privateKey.PublicKey) || serial != strings.TrimLeft(strings.ToLower(data.Serial), "0") ||
		certificate.NotBefore.After(now) || !certificate.NotAfter.After(now.Add(24*time.Hour)) {
		return nil, invalid
	}
	if len(data.PublicKeyFiles) < 1 || len(data.PublicKeyFiles) > 5 {
		return nil, fail("WECHAT_PINNED_KEYS_REQUIRED", 400)
	}
	publicKeys := map[string]*rsa.PublicKey{}
	for serial, file := range data.PublicKeyFiles {
		if !platformKeyPattern.MatchString(serial) && !serialPattern.MatchString(serial) {
			return nil, fail("WECHAT_PUBLIC_KEY_ID_INVALID", 400)
		}
		raw, err := secretFile(file)
		if err != nil {
			return nil, err
		}
		if publicKeys[serial], err = rsaPublicKey(raw); err != nil {
			return nil, err
		}
	}
	apiV3Key, err := secretFile(data.APIV3KeyFile)
	if err != nil {
		return nil, err
	}
	apiV3Key = []byte(strings.TrimSpace(string(apiV3Key)))
	if len(apiV3Key) != 32 {
		return nil, fail("WECHAT_API_V3_KEY_INVALID", 400)
	}
	callback, err := url.Parse(data.NotifyURL)
	if err != nil || callback.Scheme != "https" || callback.User != nil || callback.RawQuery != "" || callback.Fragment != "" ||
		callback.Path != "/callbacks/wechatpay" {
		return nil, fail("WECHAT_CALLBACK_URL_INVALID", 400)
	}
	return &Credentials{AppID: data.AppID, MerchantID: data.MerchantID, Serial: data.Serial, PrivateKey: privateKey,
		PublicKeys: publicKeys, APIV3Key: apiV3Key, NotifyURL: callback.String()}, nil
}

// LiveTransport reaches only the WeChat Pay origin and refuses redirects.
func LiveTransport(enabled bool) (Transport, error) {
	if !enabled {
		return nil, fail("REAL_PROVIDER_NOT_QUALIFIED", 503)
	}
	return func(request *http.Request) (*http.Response, error) {
		if !sameOrigin(request.URL) {
			return nil, fail("WECHAT_ORIGIN_FORBIDDEN", 400)
		}
		return wechatPay(request)
	}, nil
}
