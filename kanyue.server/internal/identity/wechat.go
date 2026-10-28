package identity

import (
	"bytes"
	"crypto/aes"
	"crypto/cipher"
	"crypto/sha1"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"time"

	"kanyue.server/internal/gatewaylink"
)

// wechatSession is the jscode2session payload.
type wechatSession struct {
	OpenID     string `json:"openid"`
	UnionID    string `json:"unionid"`
	SessionKey string `json:"session_key"`
	ErrCode    int    `json:"errcode"`
	ErrMsg     string `json:"errmsg"`
}

type wechatClient struct {
	appID, secret, sessionURL string
	http                      *http.Client
}

// exchange mirrors Hono's exchangeCodeForSession; error messages reach the client.
func (w wechatClient) exchange(code string) (wechatSession, error) {
	var session wechatSession
	if w.appID == "" || w.secret == "" {
		return session, errors.New("未配置微信小程序的 APPID 或 SECRET")
	}
	target, err := url.Parse(w.sessionURL)
	if err != nil {
		return session, err
	}
	query := target.Query()
	query.Set("appid", w.appID)
	query.Set("secret", w.secret)
	query.Set("js_code", code)
	query.Set("grant_type", "authorization_code")
	target.RawQuery = query.Encode()

	client := w.http
	if client == nil {
		client = &http.Client{Timeout: 10 * time.Second, Transport: gatewaylink.Track("wechat", nil)}
	}
	response, err := client.Get(target.String())
	if err != nil {
		return session, err
	}
	defer response.Body.Close()
	raw, err := io.ReadAll(response.Body)
	if err != nil {
		return session, err
	}
	if len(bytes.TrimSpace(raw)) > 0 {
		if err := json.Unmarshal(raw, &session); err != nil {
			return session, errors.New("解析微信返回数据失败")
		}
	}
	if response.StatusCode != http.StatusOK {
		return session, errors.New(fallback(session.ErrMsg, "微信接口请求失败"))
	}
	if session.ErrCode != 0 {
		return session, errors.New(fallback(session.ErrMsg, "微信接口返回错误"))
	}
	return session, nil
}

// validSignature skips the check when any part is missing, as Hono does.
func validSignature(rawData, sessionKey, signature string) bool {
	if rawData == "" || sessionKey == "" || signature == "" {
		return true
	}
	digest := sha1.Sum([]byte(rawData + sessionKey))
	return hex.EncodeToString(digest[:]) == signature
}

type wechatPhone struct {
	PhoneNumber     string `json:"phoneNumber"`
	PurePhoneNumber string `json:"purePhoneNumber"`
}

// decryptPhone is AES-128-CBC with PKCS#7 padding over base64 inputs.
func decryptPhone(sessionKey, encryptedData, iv string) (wechatPhone, error) {
	var phone wechatPhone
	key, err := base64.StdEncoding.DecodeString(sessionKey)
	if err != nil {
		return phone, err
	}
	vector, err := base64.StdEncoding.DecodeString(iv)
	if err != nil {
		return phone, err
	}
	data, err := base64.StdEncoding.DecodeString(encryptedData)
	if err != nil {
		return phone, err
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return phone, err
	}
	if len(vector) != block.BlockSize() || len(data) == 0 || len(data)%block.BlockSize() != 0 {
		return phone, errors.New("invalid ciphertext")
	}
	plain := make([]byte, len(data))
	cipher.NewCBCDecrypter(block, vector).CryptBlocks(plain, data)
	padding := int(plain[len(plain)-1])
	if padding == 0 || padding > block.BlockSize() || !bytes.Equal(plain[len(plain)-padding:], bytes.Repeat([]byte{byte(padding)}, padding)) {
		return phone, errors.New("invalid padding")
	}
	err = json.Unmarshal(plain[:len(plain)-padding], &phone)
	return phone, err
}

func fallback(value, other string) string {
	if value != "" {
		return value
	}
	return other
}
