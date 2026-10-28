package pay

import (
	"crypto/sha256"
	"encoding/hex"
	"regexp"
	"strings"
)

// Statements imports trade bills, matches them against gateway records and keeps bank evidence.
type Statements struct {
	Gateway    *Gateway
	MerchantID string
	AppID      string
}

type StatementImport struct {
	Date    string
	Content string
	Mock    bool
	Source  string
	ActorID string
}

// Import is immutable per date: a different file for the same day is a conflict, not an overwrite.
func (s *Statements) Import(input StatementImport) (map[string]any, error) {
	lines, err := parseTradeBill(input.Content, input.Date, s.MerchantID, s.AppID)
	if err != nil {
		return nil, err
	}
	sum := sha256.Sum256([]byte(input.Content))
	hash := hex.EncodeToString(sum[:])
	g := s.Gateway
	id := recordID("statement", g.Owner, input.Date)
	err = retryErr(func() error {
		previous, err := g.Store.Get(id)
		if err != nil {
			return err
		}
		if previous != nil {
			if str(previous.Data, "hash") != hash {
				return fail("STATEMENT_DATE_CONFLICT", 409)
			}
			return nil
		}
		fees, captured, refundRequested := 0, 0, 0
		for _, line := range lines {
			fees += line.Fees
			if line.Kind == "payment" {
				captured += line.Amount
			} else {
				refundRequested += line.Amount
			}
		}
		return g.Store.Commit([]Mutation{insert(g.fresh(id, "statement", map[string]any{"date": input.Date, "hash": hash,
			"source": input.Source, "mock": input.Mock, "actorId": input.ActorID, "count": len(lines), "ready": false,
			"importedAt": g.Clock(), "fees": fees, "captured": captured, "refundRequested": refundRequested}))})
	})
	if err != nil {
		return nil, err
	}
	for _, line := range lines {
		err := retryErr(func() error {
			lineID := recordID("statement-line", id, line.Kind, line.TargetID)
			if existing, err := g.Store.Get(lineID); err != nil || existing != nil {
				return err
			}
			data := line.data()
			difference, err := s.difference(data)
			if err != nil {
				return err
			}
			data["statementId"], data["difference"] = id, difference
			return g.Store.Commit([]Mutation{insert(g.fresh(lineID, "statement_line", data))})
		})
		if err != nil {
			return nil, err
		}
	}
	err = retryErr(func() error {
		row, err := g.Owned(id, "statement")
		if err != nil || flag(row.Data, "ready") {
			return err
		}
		return g.Store.Commit([]Mutation{update(next(row, map[string]any{"ready": true}))})
	})
	if err != nil {
		return nil, err
	}
	return s.Detail(id)
}

// difference explains why a bill line does not match the gateway, or "" when it does.
// Refund bills snapshot the acceptance day; PROCESSING is not proof of a final result.
func (s *Statements) difference(line map[string]any) (string, error) {
	g := s.Gateway
	entity, err := g.Store.Get(str(line, "targetId"))
	if err != nil {
		return "", err
	}
	kind := str(line, "kind")
	if entity == nil || entity.Owner != g.Owner || entity.Kind != kind {
		return "MISSING_GATEWAY_RECORD", nil
	}
	if num(entity.Data, "amount") != num(line, "amount") {
		return "AMOUNT_MISMATCH", nil
	}
	if kind == "refund" && str(entity.Data, "paymentId") != str(line, "paymentId") {
		return "PAYMENT_REFERENCE_MISMATCH", nil
	}
	provider, err := g.Store.Get(recordID("provider", str(line, "targetId")))
	if err != nil {
		return "", err
	}
	if provider == nil || str(provider.Data, "receiptId") == "" || str(provider.Data, "receiptId") != str(line, "receiptId") {
		return "RECEIPT_MISMATCH", nil
	}
	if str(line, "status") == "SUCCESS" && str(entity.Data, "status") != "succeeded" {
		return "UNAPPLIED_SUCCESS", nil
	}
	if kind == "payment" && str(entity.Data, "status") != "succeeded" {
		return "STATE_MISMATCH", nil
	}
	return "", nil
}

func withID(row Row) map[string]any {
	item := map[string]any{"id": row.ID}
	for key, value := range row.Data {
		item[key] = value
	}
	return item
}

func (s *Statements) Detail(id string) (map[string]any, error) {
	g := s.Gateway
	statement, err := g.Owned(id, "statement")
	if err != nil {
		return nil, err
	}
	date := str(statement.Data, "date")
	lineRows, err := g.Store.List("statement_line", g.Owner, Where{"statementId": id})
	if err != nil {
		return nil, err
	}
	lines, covered, refundCoverage := []any{}, map[string]bool{}, map[string]bool{}
	for _, row := range lineRows {
		lines = append(lines, withID(row))
		if str(row.Data, "kind") == "payment" {
			covered[str(row.Data, "targetId")] = true
		} else {
			refundCoverage[str(row.Data, "targetId")] = true
		}
	}
	payments, err := g.Store.List("payment", g.Owner, Where{"channel": "wechatpay", "status": "succeeded"})
	if err != nil {
		return nil, err
	}
	missingPayments := []any{}
	for _, row := range payments {
		if chinaDate(str(row.Data, "paidAt")) == date && !covered[row.ID] {
			missingPayments = append(missingPayments, row.ID)
		}
	}
	receipts, err := g.Store.List("provider", g.Owner, Where{"targetKind": "refund"})
	if err != nil {
		return nil, err
	}
	missingRefunds := []any{}
	for _, row := range receipts {
		if chinaDate(str(row.Data, "acceptedAt")) == date && !refundCoverage[str(row.Data, "targetId")] {
			missingRefunds = append(missingRefunds, row.Data["targetId"])
		}
	}
	settlementRows, err := g.Store.List("settlement", g.Owner, Where{"statementId": id})
	if err != nil {
		return nil, err
	}
	settlements := []any{}
	for _, row := range settlementRows {
		settlements = append(settlements, withID(row))
	}
	detail := withID(statement)
	detail["lines"], detail["missingPayments"], detail["missingRefunds"], detail["settlements"] = lines, missingPayments, missingRefunds, settlements
	return detail, nil
}

// Review resolves a line whose difference has since cleared, with an audited note.
func (s *Statements) Review(lineID, actorID, note string) error {
	if actorID == "" || len([]rune(strings.TrimSpace(note))) < 2 || len([]rune(note)) > 500 {
		return fail("REVIEW_REASON_REQUIRED", 400)
	}
	g := s.Gateway
	row, err := g.Owned(lineID, "statement_line")
	if err != nil {
		return err
	}
	difference, err := s.difference(row.Data)
	if err != nil {
		return err
	}
	if difference != "" {
		return fail("STATEMENT_DIFFERENCE_UNRESOLVED", 409)
	}
	at := g.Clock()
	return g.Store.Commit([]Mutation{update(next(row, map[string]any{"resolution": map[string]any{"actorId": actorID, "note": note, "at": at}})),
		insert(g.fresh(recordID("statement-review", row.ID, row.Version), "audit", map[string]any{"targetId": row.ID,
			"statementId": row.Data["statementId"], "actorId": actorID, "note": note, "at": at, "action": "statement_difference_resolved"}))})
}

var (
	settlementReference = regexp.MustCompile(`^[A-Za-z0-9_-]{1,100}$`)
	evidenceHash        = regexp.MustCompile(`^[a-f0-9]{64}$`)
)

// Settlement records operator-attested bank evidence; the original receipt stays with finance.
func (s *Statements) Settlement(statementID string, input map[string]any) (map[string]any, error) {
	g := s.Gateway
	if _, err := g.Owned(statementID, "statement"); err != nil {
		return nil, err
	}
	reference, _ := input["reference"].(string)
	hash, _ := input["evidenceHash"].(string)
	amount, isNumber := number(input["amount"])
	actorID, _ := input["actorId"].(string)
	date, _ := input["date"].(string)
	if !settlementReference.MatchString(reference) || !evidenceHash.MatchString(hash) || !isNumber || amount != float64(int(amount)) ||
		amount < 0 || amount > 9007199254740991 || !validDate(date) || actorID == "" {
		return nil, fail("SETTLEMENT_EVIDENCE_REQUIRED", 400)
	}
	data := map[string]any{"statementId": statementID, "reference": reference, "evidenceHash": hash, "amount": int(amount),
		"date": date, "actorId": actorID, "source": "operator_bank_evidence", "recordedAt": g.Clock()}
	id := recordID("settlement", g.Owner, reference)
	err := retryErr(func() error {
		old, err := g.Store.Get(id)
		if err != nil {
			return err
		}
		if old == nil {
			return g.Store.Commit([]Mutation{insert(g.fresh(id, "settlement", data))})
		}
		if str(old.Data, "statementId") != statementID || num(old.Data, "amount") != int(amount) || str(old.Data, "evidenceHash") != hash ||
			str(old.Data, "date") != date || str(old.Data, "actorId") != actorID {
			return fail("SETTLEMENT_CONFLICT", 409)
		}
		return nil
	})
	return map[string]any{"id": id}, err
}

// Export is a formula-safe CSV of matched lines and lines the bill is missing.
func (s *Statements) Export(id string) (string, error) {
	detail, err := s.Detail(id)
	if err != nil {
		return "", err
	}
	date := detail["date"]
	rows := [][]any{{"账单日期", "类别", "渠道单号", "金额(分)", "手续费(分)", "账单状态", "核对差异", "处理说明"}}
	for _, item := range detail["lines"].([]any) {
		line := item.(map[string]any)
		kind := "收款"
		if str(line, "kind") != "payment" {
			kind = "退款"
		}
		rows = append(rows, []any{date, kind, line["targetId"], line["amount"], line["fees"], line["status"], line["difference"],
			str(mapOf(line["resolution"]), "note")})
	}
	for _, targetID := range detail["missingPayments"].([]any) {
		rows = append(rows, []any{date, "收款", targetID, "", "", "", "账单缺失", ""})
	}
	for _, targetID := range detail["missingRefunds"].([]any) {
		rows = append(rows, []any{date, "退款", targetID, "", "", "", "账单缺失", ""})
	}
	return csvExport(rows), nil
}
