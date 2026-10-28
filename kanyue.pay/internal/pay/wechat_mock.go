package pay

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha1"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"net/http"
	"net/url"
	"reflect"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"sync"
	"time"
)

const mockPlatformSerial = "PUB_KEY_ID_3000000001"

// MockKeys are ephemeral merchant and platform keys for the signed mock peer.
type MockKeys struct {
	Credentials        *Credentials
	MerchantPublicKey  *rsa.PublicKey
	PlatformPrivateKey *rsa.PrivateKey
}

func MockCredentials() *MockKeys {
	merchant, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		panic(err)
	}
	platform, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		panic(err)
	}
	apiV3Key := make([]byte, 32)
	rand.Read(apiV3Key)
	return &MockKeys{
		Credentials: &Credentials{AppID: "wx0000000000000000", MerchantID: "1900000001",
			Serial: "4D4F434B4D45524348414E5453455249414C", PrivateKey: merchant,
			PublicKeys: map[string]*rsa.PublicKey{mockPlatformSerial: &platform.PublicKey},
			APIV3Key:   apiV3Key, NotifyURL: "https://kanyue-pay-mock.invalid/callbacks/wechatpay"},
		MerchantPublicKey: &merchant.PublicKey, PlatformPrivateKey: platform,
	}
}

// Mock faults for the next channel call.
const (
	FaultTimeoutBefore = "timeout-before"
	FaultTimeoutAfter  = "timeout-after"
	FaultBadSignature  = "bad-signature"
	FaultHTTP500       = "http500"
)

// WechatMock is a signed in-process WeChat peer. It owns channel state only and
// never reads or mutates payment or refund ledger rows.
type WechatMock struct {
	Store Store
	Owner string
	Keys  *MockKeys

	mu        sync.Mutex
	faultNext string
	faultPath string
}

// Fault makes the next call (to path, if set) fail in the given way.
func (m *WechatMock) Fault(kind, path string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.faultNext, m.faultPath = kind, path
}

func (m *WechatMock) takeFault(path string) string {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.faultPath != "" && m.faultPath != path {
		return ""
	}
	fault := m.faultNext
	m.faultNext, m.faultPath = "", ""
	return fault
}

func (m *WechatMock) Transport(request *http.Request) (*http.Response, error) {
	fault := m.takeFault(request.URL.Path)
	if fault == FaultTimeoutBefore {
		return nil, errors.New("MOCK_NETWORK_TIMEOUT")
	}
	raw := ""
	if request.Body != nil {
		body, err := io.ReadAll(request.Body)
		if err != nil {
			return nil, err
		}
		raw = string(body)
	}
	if !sameOrigin(request.URL) {
		return nil, fail("MOCK_NETWORK_EGRESS_FORBIDDEN", 400)
	}
	response, err := m.serve(request, raw, fault)
	if err != nil {
		var coded *Error
		if !errors.As(err, &coded) {
			return nil, err
		}
		response = m.Signed(map[string]any{"code": coded.Code}, coded.Status)
	}
	if fault == FaultTimeoutAfter {
		return nil, errors.New("MOCK_RESPONSE_LOST_AFTER_ACCEPTANCE")
	}
	if fault == FaultBadSignature {
		response.Header.Set("Wechatpay-Signature", "WECHATPAY/SIGNTEST/invalid")
	}
	return response, nil
}

func (m *WechatMock) serve(request *http.Request, raw, fault string) (*http.Response, error) {
	if err := m.verifyRequest(request, raw); err != nil {
		return nil, err
	}
	if fault == FaultHTTP500 {
		return m.Signed(map[string]any{"code": "SYSTEM_ERROR"}, 500), nil
	}
	body := map[string]any{}
	if raw != "" {
		var value any
		if err := json.Unmarshal([]byte(raw), &value); err != nil {
			return nil, err
		}
		var err error
		if body, err = objectValue(value); err != nil {
			return nil, err
		}
	}
	return m.route(request.URL, request.Method, body)
}

var authField = regexp.MustCompile(`(\w+)="([^"]*)"`)

func (m *WechatMock) verifyRequest(request *http.Request, body string) error {
	header := request.Header.Get("Authorization")
	if !strings.HasPrefix(header, "WECHATPAY2-SHA256-RSA2048 ") {
		return fail("SIGN_ERROR", 401)
	}
	fields := map[string]string{}
	for _, match := range authField.FindAllStringSubmatch(header, -1) {
		fields[match[1]] = match[2]
	}
	at, _ := strconv.ParseInt(fields["timestamp"], 10, 64)
	credentials := m.Keys.Credentials
	if fields["mchid"] != credentials.MerchantID || fields["serial_no"] != credentials.Serial ||
		!timestampPattern.MatchString(fields["timestamp"]) || math.Abs(float64(seconds()-at)) > 300 {
		return fail("SIGN_ERROR", 401)
	}
	return verifyMessage(fmt.Sprintf("%s\n%s\n%s\n%s\n%s\n", request.Method, requestURI(request.URL), fields["timestamp"],
		fields["nonce_str"], body), fields["signature"], m.Keys.MerchantPublicKey)
}

// SignedParts are the platform-signed headers and raw body of a peer response.
func (m *WechatMock) SignedParts(value any, status int) (http.Header, string) {
	raw := ""
	if status != http.StatusNoContent {
		raw = string(jsonBytes(value))
	}
	timestamp, random := strconv.FormatInt(seconds(), 10), nonce()
	header := http.Header{}
	header.Set("Content-Type", "application/json")
	header.Set("Wechatpay-Timestamp", timestamp)
	header.Set("Wechatpay-Nonce", random)
	header.Set("Wechatpay-Serial", mockPlatformSerial)
	header.Set("Wechatpay-Signature", rsaSign(fmt.Sprintf("%s\n%s\n%s\n", timestamp, random, raw), m.Keys.PlatformPrivateKey))
	return header, raw
}

func (m *WechatMock) Signed(value any, status int) *http.Response {
	header, raw := m.SignedParts(value, status)
	return newResponse(status, header, raw)
}

var (
	tradePath  = regexp.MustCompile(`^/v3/pay/transactions/out-trade-no/([a-z0-9]{15})(/close)?$`)
	refundPath = regexp.MustCompile(`^/v3/refund/domestic/refunds/([a-z0-9]{15})$`)
	datePath   = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}$`)
)

func (m *WechatMock) route(target *url.URL, method string, body map[string]any) (*http.Response, error) {
	credentials := m.Keys.Credentials
	path := target.Path
	if method == http.MethodPost && path == "/v3/pay/transactions/jsapi" {
		payer, err := objectValue(body["payer"])
		if err != nil {
			return nil, err
		}
		if _, ok := payer["openid"].(string); !ok || body["mchid"] != credentials.MerchantID ||
			body["appid"] != credentials.AppID || body["notify_url"] != credentials.NotifyURL {
			return nil, fail("PARAM_ERROR", 400)
		}
		amount, err := objectValue(body["amount"])
		if err != nil {
			return nil, err
		}
		if total, ok := number(amount["total"]); !ok || total != math.Trunc(total) || total <= 0 || amount["currency"] != "CNY" {
			return nil, fail("PARAM_ERROR", 400)
		}
		row, err := m.create("payment", jsString(body["out_trade_no"]), body)
		if err != nil {
			return nil, err
		}
		if str(row.Data, "state") != "NOTPAY" {
			return nil, fail("ORDERPAID", 400)
		}
		return m.Signed(map[string]any{"prepay_id": "wxmock" + str(row.Data, "targetId")}, 200), nil
	}
	if trade := tradePath.FindStringSubmatch(path); trade != nil {
		mchid := body["mchid"]
		if method == http.MethodGet {
			mchid = target.Query().Get("mchid")
		}
		if mchid != credentials.MerchantID {
			return nil, fail("PARAM_ERROR", 400)
		}
		row, err := m.Get(trade[1])
		if err != nil {
			return nil, err
		}
		if str(row.Data, "kind") != "payment" {
			return nil, fail("ORDER_NOT_EXIST", 404)
		}
		if method == http.MethodGet && trade[2] == "" {
			return m.Signed(m.PaymentWire(row), 200), nil
		}
		if method == http.MethodPost && trade[2] != "" {
			err := retryErr(func() error {
				current, err := m.Get(trade[1])
				if err != nil {
					return err
				}
				state := str(current.Data, "state")
				if state == "SUCCESS" || state == "REFUND" {
					return fail("ORDERPAID", 400)
				}
				if state == "CLOSED" {
					return nil
				}
				return m.Store.Commit([]Mutation{update(next(current, map[string]any{"state": "CLOSED"}))})
			})
			if err != nil {
				return nil, err
			}
			return m.Signed(nil, http.StatusNoContent), nil
		}
	}
	if method == http.MethodPost && path == "/v3/refund/domestic/refunds" {
		row, err := m.create("refund", jsString(body["out_refund_no"]), body)
		if err != nil {
			return nil, err
		}
		wire, err := m.refundWire(row)
		if err != nil {
			return nil, err
		}
		return m.Signed(wire, 200), nil
	}
	if refund := refundPath.FindStringSubmatch(path); method == http.MethodGet && refund != nil {
		row, err := m.Get(refund[1])
		if err != nil {
			return nil, err
		}
		if str(row.Data, "kind") != "refund" {
			return nil, fail("RESOURCE_NOT_EXISTS", 404)
		}
		wire, err := m.refundWire(row)
		if err != nil {
			return nil, err
		}
		return m.Signed(wire, 200), nil
	}
	if method == http.MethodGet && path == "/v3/bill/tradebill" {
		date := target.Query().Get("bill_date")
		if !datePath.MatchString(date) {
			return nil, fail("PARAM_ERROR", 400)
		}
		content, err := m.bill(date)
		if err != nil {
			return nil, err
		}
		sum := sha1.Sum([]byte(content))
		return m.Signed(map[string]any{"hash_type": "SHA1", "hash_value": hex.EncodeToString(sum[:]),
			"download_url": wechatOrigin + "/v3/billdownload/file?token=" + date}, 200), nil
	}
	if method == http.MethodGet && path == "/v3/billdownload/file" {
		content, err := m.bill(target.Query().Get("token"))
		if err != nil {
			return nil, err
		}
		return newResponse(200, http.Header{"Content-Type": {"text/csv"}}, content), nil
	}
	return m.Signed(map[string]any{"code": "RESOURCE_NOT_EXISTS"}, 404), nil
}

// normalJSON is value as the store would return it, for order-insensitive request comparison.
func normalJSON(value any) any {
	var normal any
	json.Unmarshal(jsonBytes(value), &normal)
	return normal
}

func (m *WechatMock) create(kind, targetID string, request map[string]any) (Row, error) {
	if !idPattern.MatchString(targetID) {
		return Row{}, fail("PARAM_ERROR", 400)
	}
	return retry(func() (Row, error) {
		id := recordID("wechat-mock", m.Owner, targetID)
		previous, err := m.Store.Get(id)
		if err != nil {
			return Row{}, err
		}
		if previous != nil {
			if str(previous.Data, "kind") != kind || !reflect.DeepEqual(normalJSON(previous.Data["request"]), normalJSON(request)) {
				return Row{}, fail("OUT_TRADE_NO_USED", 409)
			}
			return *previous, nil
		}
		state := "NOTPAY"
		if kind == "refund" {
			state = "PROCESSING"
		}
		row := fresh(id, "wechat_mock", m.Owner, map[string]any{"kind": kind, "targetId": targetID, "request": request,
			"state": state, "createdAt": nowISO(), "reserved": 0, "refunded": 0})
		changes := []Mutation{insert(row)}
		if kind == "refund" {
			payment, err := m.Get(jsString(request["out_trade_no"]))
			if err != nil {
				return Row{}, err
			}
			amount, err := objectValue(request["amount"])
			if err != nil {
				return Row{}, err
			}
			paymentAmount, err := objectValue(mapOf(payment.Data["request"])["amount"])
			if err != nil {
				return Row{}, err
			}
			total, _ := number(paymentAmount["total"])
			refund, ok := number(amount["refund"])
			if str(payment.Data, "kind") != "payment" || str(payment.Data, "state") != "SUCCESS" || amount["total"] != paymentAmount["total"] ||
				amount["currency"] != "CNY" || !ok || refund != math.Trunc(refund) || refund <= 0 ||
				int(refund) > int(total)-num(payment.Data, "reserved")-num(payment.Data, "refunded") {
				return Row{}, fail("NOT_ENOUGH", 400)
			}
			changes = append(changes, update(next(payment, map[string]any{"reserved": num(payment.Data, "reserved") + int(refund)})))
		}
		return row, m.Store.Commit(changes)
	})
}

func (m *WechatMock) Get(targetID string) (Row, error) {
	row, err := m.Store.Get(recordID("wechat-mock", m.Owner, targetID))
	if err != nil {
		return Row{}, err
	}
	if row == nil || row.Owner != m.Owner || row.Kind != "wechat_mock" {
		return Row{}, fail("ORDER_NOT_EXIST", 404)
	}
	return *row, nil
}

// Observe moves channel state as a payer or the bank would.
func (m *WechatMock) Observe(targetID string, input map[string]any) error {
	status := jsString(input["status"])
	if !slices.Contains([]string{"succeeded", "failed", "abnormal", "processing"}, status) {
		return fail("INVALID_PROVIDER_STATUS", 400)
	}
	return retryErr(func() error {
		row, err := m.Get(targetID)
		if err != nil {
			return err
		}
		refund := str(row.Data, "kind") == "refund"
		state := map[string]string{"succeeded": "SUCCESS", "abnormal": "ABNORMAL", "processing": "PROCESSING"}[status]
		if status == "failed" {
			state = "PAYERROR"
			if refund {
				state = "CLOSED"
			}
		}
		current := str(row.Data, "state")
		if !refund && state != "SUCCESS" && state != "PAYERROR" {
			return fail("INVALID_PROVIDER_STATUS", 400)
		}
		if current == "SUCCESS" && state != "SUCCESS" {
			return fail("CAPTURE_IS_IMMUTABLE", 409)
		}
		if refund && current == "CLOSED" && state != "CLOSED" {
			return fail("REFUND_FAILURE_IS_FINAL", 409)
		}
		if current == state {
			return nil
		}
		patch := map[string]any{"state": state}
		if state == "SUCCESS" {
			patch["succeededAt"] = nowISO()
		}
		changes := []Mutation{update(next(row, patch))}
		if refund && (state == "SUCCESS" || state == "CLOSED") {
			request := mapOf(row.Data["request"])
			payment, err := m.Get(jsString(request["out_trade_no"]))
			if err != nil {
				return err
			}
			amount := num(mapOf(request["amount"]), "refund")
			if num(payment.Data, "reserved") < amount {
				return fail("MOCK_REFUND_RESERVATION_MISMATCH", 400)
			}
			refunded := num(payment.Data, "refunded")
			if state == "SUCCESS" {
				refunded += amount
			}
			changes = append(changes, update(next(payment, map[string]any{"reserved": num(payment.Data, "reserved") - amount, "refunded": refunded})))
		}
		return m.Store.Commit(changes)
	})
}

func (m *WechatMock) PaymentWire(row Row) map[string]any {
	wire := map[string]any{}
	for key, value := range mapOf(row.Data["request"]) {
		wire[key] = value
	}
	wire["trade_state"], wire["trade_type"] = row.Data["state"], "JSAPI"
	if str(row.Data, "state") == "SUCCESS" {
		wire["transaction_id"], wire["success_time"] = "420000"+str(row.Data, "targetId"), row.Data["succeededAt"]
	}
	return wire
}

func (m *WechatMock) refundWire(row Row) (map[string]any, error) {
	request := mapOf(row.Data["request"])
	payment, err := m.Get(jsString(request["out_trade_no"]))
	if err != nil {
		return nil, err
	}
	wire := map[string]any{}
	for key, value := range request {
		wire[key] = value
	}
	wire["refund_id"] = "503000" + str(row.Data, "targetId")
	wire["transaction_id"] = "420000" + str(payment.Data, "targetId")
	wire["status"], wire["create_time"] = row.Data["state"], row.Data["createdAt"]
	return wire, nil
}

// Notification is the encrypted, platform-signed callback the channel would send for a terminal state.
func (m *WechatMock) Notification(targetID string) (http.Header, string, error) {
	row, err := m.Get(targetID)
	if err != nil {
		return nil, "", err
	}
	refund := str(row.Data, "kind") == "refund"
	state := str(row.Data, "state")
	if (refund && !slices.Contains([]string{"SUCCESS", "CLOSED", "ABNORMAL"}, state)) || (!refund && state != "SUCCESS") {
		return nil, "", fail("MOCK_NOTIFICATION_NOT_TERMINAL", 400)
	}
	request := mapOf(row.Data["request"])
	data := m.PaymentWire(row)
	associated, eventType, original := "transaction", "TRANSACTION.SUCCESS", "transaction"
	if refund {
		amount := mapOf(request["amount"])
		data = map[string]any{"mchid": m.Keys.Credentials.MerchantID, "out_refund_no": row.Data["targetId"],
			"out_trade_no": request["out_trade_no"], "transaction_id": "420000" + jsString(request["out_trade_no"]),
			"refund_id": "503000" + str(row.Data, "targetId"), "refund_status": state,
			"amount": map[string]any{"total": amount["total"], "refund": amount["refund"], "payer_total": amount["total"], "payer_refund": amount["refund"]}}
		if succeeded, ok := row.Data["succeededAt"]; ok {
			data["success_time"] = succeeded
		}
		associated, eventType, original = "refund", "REFUND."+state, "refund"
	}
	random := make([]byte, 6)
	rand.Read(random)
	nonceValue := hex.EncodeToString(random)
	header, raw := m.SignedParts(map[string]any{"id": recordID("notification", row.ID, row.Version), "create_time": nowISO(),
		"event_type": eventType, "resource_type": "encrypt-resource",
		"resource": map[string]any{"algorithm": "AEAD_AES_256_GCM", "ciphertext": encrypt(m.Keys.Credentials.APIV3Key, nonceValue, associated, jsonBytes(data)),
			"nonce": nonceValue, "associated_data": associated, "original_type": original}}, 200)
	return header, raw, nil
}

func (m *WechatMock) bill(date string) (string, error) {
	rows, err := m.Store.List("wechat_mock", m.Owner, nil)
	if err != nil {
		return "", err
	}
	return mockBill(date, rows, m.Keys.Credentials), nil
}

var billHeaders = []string{"交易时间", "公众账号ID", "商户号", "微信订单号", "商户订单号", "交易状态", "货币种类",
	"应结订单金额", "微信退款单号", "商户退款单号", "退款金额", "退款状态", "手续费", "订单金额", "申请退款金额"}

// mockBill renders channel records in the official ALL trade-bill format.
func mockBill(date string, rows []Row, credentials *Credentials) string {
	captured, refunds, fees := 0, 0, 0
	lines := []string{}
	for _, row := range rows {
		data := row.Data
		refund := str(data, "kind") == "refund"
		at := str(data, "succeededAt")
		if refund {
			at = str(data, "createdAt")
		}
		if (!refund && str(data, "state") != "SUCCESS") || !strings.HasPrefix(chinaTime(at), date) {
			continue
		}
		request := mapOf(data["request"])
		amount := num(mapOf(request["amount"]), "total")
		if refund {
			amount = num(mapOf(request["amount"]), "refund")
		}
		fee := int(math.Floor(float64(amount) * 0.006))
		if refund {
			fee = -fee
			if str(data, "state") != "SUCCESS" {
				fee = 0
			}
			refunds += amount
		} else {
			captured += amount
		}
		fees += fee
		paymentID := str(data, "targetId")
		cells := []string{chinaTime(at), credentials.AppID, credentials.MerchantID}
		if refund {
			paymentID = jsString(request["out_trade_no"])
			status := map[string]string{"CLOSED": "FAIL", "ABNORMAL": "CHANGE"}[str(data, "state")]
			if status == "" {
				status = str(data, "state")
			}
			cells = append(cells, "420000"+paymentID, paymentID, "REFUND", "CNY", "0.00", "503000"+str(data, "targetId"),
				str(data, "targetId"), yuan(amount), status, yuan(fee), "0.00", yuan(amount))
		} else {
			cells = append(cells, "420000"+paymentID, paymentID, "SUCCESS", "CNY", yuan(amount), "0", "0", "0.00", "",
				yuan(fee), yuan(amount), "0.00")
		}
		lines = append(lines, tick(cells...))
	}
	return strings.Join(append(append([]string{strings.Join(billHeaders, ",")}, lines...),
		"总交易单数,手续费总金额,订单总金额,申请退款总金额", tick(strconv.Itoa(len(lines)), yuan(fees), yuan(captured), yuan(refunds))), "\n") + "\n"
}

func tick(cells ...string) string {
	for i, cell := range cells {
		cells[i] = "`" + cell
	}
	return strings.Join(cells, ",")
}

func yuan(value int) string { return strconv.FormatFloat(float64(value)/100, 'f', 2, 64) }

func chinaTime(value string) string {
	at, ok := parseTime(value)
	if !ok {
		return ""
	}
	return at.In(china).Format(time.DateTime)
}
