package coursecredit

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"kanyue.server/internal/gatewaylink"
	"kanyue.server/internal/jsx"
)

// RenewalWechat sends renewal reminders as WeChat subscribe messages. Without a
// template it is unconfigured and every attempt is recorded as skipped.
type RenewalWechat struct {
	appID, secret, templateID, state, apiURL string
	// data maps template keys to text with {course}, {remaining}, {validUntil} and {message}.
	data map[string]string
	http *http.Client

	mu      sync.Mutex
	token   string
	expires time.Time
}

const renewalPage = "pages/courseShop/index"

// NewRenewalWechat checks the subscribe message settings; an empty template id disables sending.
func NewRenewalWechat(appID, secret, templateID, templateData, state, apiURL string) (*RenewalWechat, error) {
	w := &RenewalWechat{appID: appID, secret: secret, templateID: strings.TrimSpace(templateID),
		state: state, apiURL: strings.TrimRight(apiURL, "/")}
	if w.templateID == "" {
		return w, nil
	}
	if appID == "" || secret == "" {
		return nil, errors.New("WECHAT_RENEWAL_TEMPLATE_ID needs WECHAT_APPID and WECHAT_SECRET")
	}
	if err := json.Unmarshal([]byte(templateData), &w.data); err != nil || len(w.data) == 0 {
		return nil, errors.New(`WECHAT_RENEWAL_TEMPLATE_DATA must be a JSON object such as {"thing1":"{course}"}`)
	}
	if w.state == "" {
		w.state = "formal"
	}
	if w.state != "formal" && w.state != "trial" && w.state != "developer" {
		return nil, errors.New("WECHAT_MINIPROGRAM_STATE must be formal, trial or developer")
	}
	if w.apiURL == "" {
		w.apiURL = "https://api.weixin.qq.com"
	}
	w.http = &http.Client{Timeout: 10 * time.Second, Transport: gatewaylink.Track("wechat", nil)}
	return w, nil
}

// TemplateID is what the mini program asks the student to subscribe to; "" when disabled.
func (w *RenewalWechat) TemplateID() string {
	if w == nil {
		return ""
	}
	return w.templateID
}

// Send renders the template with values and sends it to openID.
func (w *RenewalWechat) Send(openID string, values map[string]string) error {
	data := map[string]any{}
	for key, text := range w.data {
		for name, value := range values {
			text = strings.ReplaceAll(text, "{"+name+"}", value)
		}
		// thing.DATA accepts at most 20 characters.
		if strings.HasPrefix(key, "thing") {
			text = jsx.Slice(text, 20)
		}
		data[key] = map[string]string{"value": text}
	}
	body := map[string]any{"touser": openID, "template_id": w.templateID, "page": renewalPage,
		"miniprogram_state": w.state, "lang": "zh_CN", "data": data}
	err := w.send(body)
	var api *wechatAPIError
	if errors.As(err, &api) && (api.Code == 40001 || api.Code == 42001) {
		w.mu.Lock()
		w.token = ""
		w.mu.Unlock()
		err = w.send(body)
	}
	return err
}

func (w *RenewalWechat) send(body map[string]any) error {
	token, err := w.accessToken()
	if err != nil {
		return err
	}
	var result wechatAPIError
	return w.post("/cgi-bin/message/subscribe/send?access_token="+url.QueryEscape(token), body, &result)
}

// accessToken uses the stable token API, so other callers of the same app keep their tokens.
func (w *RenewalWechat) accessToken() (string, error) {
	w.mu.Lock()
	defer w.mu.Unlock()
	if w.token != "" && time.Now().Before(w.expires) {
		return w.token, nil
	}
	var result struct {
		wechatAPIError
		AccessToken string `json:"access_token"`
		ExpiresIn   int    `json:"expires_in"`
	}
	err := w.post("/cgi-bin/stable_token", map[string]any{"grant_type": "client_credential", "appid": w.appID, "secret": w.secret}, &result)
	if err != nil {
		return "", err
	}
	if result.AccessToken == "" {
		return "", errors.New("微信未返回 access_token")
	}
	w.token = result.AccessToken
	w.expires = time.Now().Add(time.Duration(max(result.ExpiresIn-300, 60)) * time.Second)
	return w.token, nil
}

type wechatAPIError struct {
	Code    int    `json:"errcode"`
	Message string `json:"errmsg"`
}

func (e *wechatAPIError) Error() string {
	return fmt.Sprintf("微信接口错误 %d：%s", e.Code, e.Message)
}

// post sends JSON and decodes into result, whose embedded wechatAPIError carries errcode.
func (w *RenewalWechat) post(path string, body any, result interface{ apiError() *wechatAPIError }) error {
	raw, err := json.Marshal(body)
	if err != nil {
		return err
	}
	response, err := w.http.Post(w.apiURL+path, "application/json", bytes.NewReader(raw))
	if err != nil {
		return err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return fmt.Errorf("微信接口返回 HTTP %d", response.StatusCode)
	}
	if err := json.NewDecoder(response.Body).Decode(result); err != nil {
		return errors.New("解析微信返回数据失败")
	}
	if api := result.apiError(); api.Code != 0 {
		return api
	}
	return nil
}

func (e *wechatAPIError) apiError() *wechatAPIError { return e }
