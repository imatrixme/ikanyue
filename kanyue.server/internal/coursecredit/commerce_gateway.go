package coursecredit

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"slices"
	"strings"
	"time"

	"kanyue.server/internal/gatewaylink"
)

// gateway is Hono's commerce GatewayClient: the payment gateway's service API.
type gateway struct {
	base      *url.URL
	baseErr   error
	token     string
	mockToken string
	mock      bool
	client    *http.Client
}

// gatewayMessages are the gateway errors Hono shows verbatim.
var gatewayMessages = map[string]string{
	"STATEMENT_DATE_CONFLICT":         "该日期已导入内容不同的账单，请保留原始账单并人工核对",
	"STATEMENT_DIFFERENCE_UNRESOLVED": "账单差异仍未消除，不能标记完成",
	"STATEMENT_IDENTITY_MISMATCH":     "账单商户或小程序不匹配",
	"SETTLEMENT_CONFLICT":             "此银行流水已登记，凭证内容不一致",
	"STATEMENT_NOT_GENERATED":         "请选择已经出账的历史日期",
}

func newGateway(config CommerceConfig) *gateway {
	g := &gateway{token: config.ServiceToken, mockToken: config.MockToken, mock: config.Mock,
		client: &http.Client{Timeout: 10 * time.Second, Transport: gatewaylink.Track("kanyue.pay", nil),
			CheckRedirect: func(*http.Request, []*http.Request) error { return errors.New("redirect refused") }}}
	base := config.GatewayURL
	if base == "" {
		base = "http://127.0.0.1:1340"
	}
	parsed, err := url.Parse(base)
	switch {
	case err != nil || parsed.Scheme == "" || parsed.Host == "":
		g.baseErr = errors.New("Invalid URL")
	case parsed.Scheme == "https" ||
		(parsed.Scheme == "http" && slices.Contains([]string{"127.0.0.1", "localhost", "[::1]"}, hostOf(parsed))):
		g.base = parsed
	default:
		g.baseErr = Fail("PAYMENT_TLS_REQUIRED", "支付服务需要安全连接", nil)
	}
	return g
}

// hostOf is URL.hostname with IPv6 brackets kept, as WHATWG URL reports it.
func hostOf(u *url.URL) string {
	host := u.Hostname()
	if strings.Contains(host, ":") {
		return "[" + host + "]"
	}
	return host
}

// request sends one gateway call; a nil body sends none.
func (g *gateway) request(method, path string, body any, key string, mock bool) (any, error) {
	if g.baseErr != nil {
		return nil, g.baseErr
	}
	if mock && !g.mock {
		return nil, Fail("MOCK_PAYMENT_DISABLED", "模拟支付未开启", nil)
	}
	token := g.token
	if mock {
		token = g.mockToken
	}
	if len(token) < 32 {
		return nil, Fail("PAYMENT_NOT_CONFIGURED", "支付服务暂未配置", nil)
	}
	target, err := g.base.Parse(path)
	if err != nil {
		return nil, err
	}
	var reader io.Reader
	if body != nil {
		raw, err := json.Marshal(body)
		if err != nil {
			return nil, err
		}
		reader = bytes.NewReader(raw)
	}
	unknown := Fail("PAYMENT_RESULT_UNKNOWN", "支付结果正在确认，请稍后刷新，不要重复付款", nil)
	if method == http.MethodGet || strings.Contains(path, "statement") {
		unknown = Fail("PAYMENT_RESULT_UNKNOWN", "支付服务连接超时，请稍后刷新", nil)
	}
	req, err := http.NewRequest(method, target.String(), reader)
	if err != nil {
		return nil, unknown
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	if key != "" {
		req.Header.Set("Idempotency-Key", key)
	}
	response, err := g.client.Do(req)
	if err != nil {
		return nil, unknown
	}
	defer response.Body.Close()
	// Proxies may answer with HTML; an unreadable body is an empty error payload.
	var result any
	if raw, err := io.ReadAll(response.Body); err == nil {
		if json.Unmarshal(raw, &result) != nil {
			result = nil
		}
	}
	if response.StatusCode < 200 || response.StatusCode > 299 {
		code, _ := asMap(result)["error"].(string)
		message, ok := gatewayMessages[code]
		if !ok {
			message = "支付服务暂未完成操作，请稍后重试"
		}
		return nil, Fail("PAYMENT_CHANNEL_ERROR", message, nil)
	}
	return result, nil
}

// call is request for endpoints answering a JSON object.
func (g *gateway) call(method, path string, body any, key string) (map[string]any, error) {
	result, err := g.request(method, path, body, key, false)
	if err != nil {
		return nil, err
	}
	return asMap(result), nil
}

func (g *gateway) createPayment(orderID string, amount, payerID, description any) (map[string]any, error) {
	// JSON.stringify drops undefined fields.
	body := map[string]any{"reference": orderID, "amount": amount, "currency": "CNY"}
	if payerID != nil {
		body["payerId"] = payerID
	}
	if description != nil {
		body["description"] = description
	}
	return g.call(http.MethodPost, "/v1/payments", body, orderID)
}

func (g *gateway) refreshPayment(id string) (map[string]any, error) {
	return g.call(http.MethodPost, "/v1/payments/"+encodeURIComponent(id)+"/refresh", map[string]any{}, "")
}

func (g *gateway) payment(id string) (map[string]any, error) {
	return g.call(http.MethodGet, "/v1/payments/"+encodeURIComponent(id), nil, "")
}

func (g *gateway) refund(reference string, paymentID, amount any) (map[string]any, error) {
	return g.call(http.MethodPost, "/v1/refunds", map[string]any{"reference": reference, "paymentId": paymentID, "amount": amount}, reference)
}

func (g *gateway) refundStatus(id string) (map[string]any, error) {
	return g.call(http.MethodGet, "/v1/refunds/"+encodeURIComponent(id), nil, "")
}

// mockSuccess makes the mock channel report success, then lets the gateway poll it.
func (g *gateway) mockSuccess(id string) error {
	if _, err := g.request(http.MethodPost, "/_test/observations/"+encodeURIComponent(id), map[string]any{"status": "succeeded"}, "", true); err != nil {
		return err
	}
	_, err := g.request(http.MethodPost, "/_test/poll", map[string]any{}, "", true)
	return err
}
