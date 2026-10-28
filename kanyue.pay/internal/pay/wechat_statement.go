package pay

import (
	"regexp"
	"slices"
	"strconv"
	"strings"
	"time"
)

// TradeLine is one payment or refund row of an ALL trade bill.
type TradeLine struct {
	Kind            string `json:"kind"`
	TargetID        string `json:"targetId"`
	PaymentID       string `json:"paymentId"`
	ReceiptID       string `json:"receiptId"`
	Amount          int    `json:"amount"`
	Fees            int    `json:"fees"`
	Status          string `json:"status"`
	OccurredAt      string `json:"occurredAt"`
	SettlementBasis int    `json:"settlementBasis"`
}

func (line TradeLine) data() map[string]any {
	return map[string]any{"kind": line.Kind, "targetId": line.TargetID, "paymentId": line.PaymentID, "receiptId": line.ReceiptID,
		"amount": line.Amount, "fees": line.Fees, "status": line.Status, "occurredAt": line.OccurredAt, "settlementBasis": line.SettlementBasis}
}

var (
	unsignedAmount = regexp.MustCompile(`^\d{1,10}\.\d{2}$`)
	signedAmount   = regexp.MustCompile(`^-?\d{1,10}\.\d{2}$`)
	billTime       = regexp.MustCompile(`^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$`)
)

// decimalMinor parses a two-decimal yuan amount into fen without floating point.
func decimalMinor(value string, signed bool) (int, error) {
	pattern := unsignedAmount
	if signed {
		pattern = signedAmount
	}
	if !pattern.MatchString(value) {
		return 0, fail("STATEMENT_AMOUNT_INVALID", 400)
	}
	negative := strings.HasPrefix(value, "-")
	whole, fraction, _ := strings.Cut(strings.TrimPrefix(value, "-"), ".")
	units, _ := strconv.Atoi(whole)
	cents, _ := strconv.Atoi(fraction)
	amount := units*100 + cents
	if negative {
		return -amount, nil
	}
	return amount, nil
}

// parseTradeBill reads WeChat's delimiter-separated ALL bill. It is not RFC CSV:
// WeChat escapes embedded commas, and every cell carries a leading backtick.
func parseTradeBill(content, date, merchantID, appID string) ([]TradeLine, error) {
	if len(content) > 1024*1024 || !validDate(date) {
		return nil, fail("STATEMENT_TOO_LARGE_OR_INVALID_DATE", 400)
	}
	rows := [][]string{}
	for _, line := range regexp.MustCompile(`\r?\n`).Split(strings.TrimSpace(strings.TrimPrefix(content, "\uFEFF")), -1) {
		cells := strings.Split(line, ",")
		for i, cell := range cells {
			cells[i] = strings.TrimPrefix(cell, "`")
		}
		rows = append(rows, cells)
	}
	headers := rows[0]
	rows = rows[1:]
	unique := map[string]bool{}
	for _, header := range headers {
		unique[header] = true
	}
	for _, name := range billHeaders {
		if !unique[name] || len(unique) != len(headers) {
			return nil, fail("STATEMENT_ALL_FORMAT_REQUIRED", 400)
		}
	}
	result := []TradeLine{}
	seen := map[string]bool{}
	sum := func(kind string, pick func(TradeLine) int) int {
		total := 0
		for _, line := range result {
			if kind == "" || line.Kind == kind {
				total += pick(line)
			}
		}
		return total
	}
	for index, cells := range rows {
		if cells[0] == "总交易单数" {
			mismatch := fail("STATEMENT_TOTAL_MISMATCH", 400)
			if index != len(rows)-2 || len(rows[index+1]) != len(cells) {
				return nil, mismatch
			}
			totals := rows[index+1]
			if count, err := strconv.ParseFloat(strings.TrimSpace(totals[0]), 64); err != nil || int(count) != len(result) || count != float64(len(result)) {
				return nil, mismatch
			}
			total := func(name string) (int, error) {
				position := slices.Index(cells, name)
				if position < 0 {
					return decimalMinor("", false)
				}
				return decimalMinor(totals[position], name == "手续费总金额")
			}
			fees, err := total("手续费总金额")
			if err != nil {
				return nil, err
			}
			captured, err := total("订单总金额")
			if err != nil {
				return nil, err
			}
			refunded, err := total("申请退款总金额")
			if err != nil {
				return nil, err
			}
			amount := func(line TradeLine) int { return line.Amount }
			if fees != sum("", func(line TradeLine) int { return line.Fees }) || captured != sum("payment", amount) || refunded != sum("refund", amount) {
				return nil, mismatch
			}
			return result, nil
		}
		if len(cells) != len(headers) || len(result) >= 10000 {
			return nil, fail("STATEMENT_ROW_INVALID", 400)
		}
		row := map[string]string{}
		for i, key := range headers {
			row[key] = cells[i]
		}
		if row["商户号"] != merchantID || row["公众账号ID"] != appID || row["货币种类"] != "CNY" {
			return nil, fail("STATEMENT_IDENTITY_MISMATCH", 400)
		}
		if !billTime.MatchString(row["交易时间"]) || !strings.HasPrefix(row["交易时间"], date) {
			return nil, fail("STATEMENT_DATE_MISMATCH", 400)
		}
		kind := map[string]string{"SUCCESS": "payment", "REFUND": "refund"}[row["交易状态"]]
		if kind == "" {
			return nil, fail("STATEMENT_TRADE_TYPE_UNSUPPORTED", 400)
		}
		targetColumn, receiptColumn, amountColumn, basisColumn, status := "商户订单号", "微信订单号", "订单金额", "应结订单金额", "SUCCESS"
		if kind == "refund" {
			targetColumn, receiptColumn, amountColumn, basisColumn, status = "商户退款单号", "微信退款单号", "申请退款金额", "退款金额", row["退款状态"]
		}
		targetID := row[targetColumn]
		if targetID == "" || len([]rune(targetID)) > 64 || seen[kind+":"+targetID] {
			return nil, fail("STATEMENT_DUPLICATE_REFERENCE", 400)
		}
		seen[kind+":"+targetID] = true
		fees, err := decimalMinor(row["手续费"], true)
		if err != nil {
			return nil, err
		}
		if (kind == "payment" && fees < 0) || (kind == "refund" && fees > 0) {
			return nil, fail("STATEMENT_FEE_SIGN_INVALID", 400)
		}
		amount, err := decimalMinor(row[amountColumn], false)
		if err != nil {
			return nil, err
		}
		basis, err := decimalMinor(row[basisColumn], false)
		if err != nil {
			return nil, err
		}
		result = append(result, TradeLine{Kind: kind, TargetID: targetID, PaymentID: row["商户订单号"], ReceiptID: row[receiptColumn],
			Amount: amount, Fees: fees, SettlementBasis: basis, Status: status,
			OccurredAt: strings.Replace(row["交易时间"], " ", "T", 1) + "+08:00"})
	}
	return nil, fail("STATEMENT_SUMMARY_REQUIRED", 400)
}

func validDate(date string) bool {
	parsed, err := time.Parse(time.DateOnly, date)
	return datePath.MatchString(date) && err == nil && parsed.Format(time.DateOnly) == date
}

var formulaPrefix = regexp.MustCompile(`^[\s\p{Z}\x{FEFF}]*[=+\-@\t\r]`)

// csvExport quotes every cell and defuses spreadsheet formulas.
func csvExport(rows [][]any) string {
	lines := make([]string, len(rows))
	for i, row := range rows {
		cells := make([]string, len(row))
		for j, value := range row {
			cell := ""
			if value != nil {
				cell = jsString(value)
			}
			if formulaPrefix.MatchString(cell) {
				cell = "'" + cell
			}
			cells[j] = `"` + strings.ReplaceAll(cell, `"`, `""`) + `"`
		}
		lines[i] = strings.Join(cells, ",")
	}
	return "\uFEFF" + strings.Join(lines, "\r\n")
}
