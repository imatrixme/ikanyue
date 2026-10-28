package pay

// Reconcile records durable findings where provider results and gateway entities disagree.
func Reconcile(store Store, owner string, now string) (map[string]any, error) {
	providers, err := store.List("provider", owner, nil)
	if err != nil {
		return nil, err
	}
	findings := []any{}
	for _, provider := range providers {
		entity, err := store.Get(str(provider.Data, "targetId"))
		if err != nil {
			return nil, err
		}
		var reason string
		var entityVersion any
		switch {
		case entity == nil:
			reason = "MISSING_GATEWAY_RECORD"
		case num(entity.Data, "amount") != num(provider.Data, "amount"):
			reason = "AMOUNT_MISMATCH"
		case str(provider.Data, "status") == "succeeded" && str(entity.Data, "status") != "succeeded":
			reason = "UNAPPLIED_SUCCESS"
		case str(entity.Data, "status") == "succeeded" && str(provider.Data, "status") != "succeeded":
			reason = "MISSING_PROVIDER_SUCCESS"
		}
		if reason == "" {
			continue
		}
		if entity != nil {
			entityVersion = entity.Version
		}
		id := recordID("finding", provider.ID, provider.Version, entityVersion, reason)
		err = retryErr(func() error {
			if existing, err := store.Get(id); err != nil || existing != nil {
				return err
			}
			return store.Commit([]Mutation{insert(fresh(id, "reconciliation", owner, map[string]any{
				"targetId": provider.Data["targetId"], "reason": reason, "occurredAt": now}))})
		})
		if err != nil {
			return nil, err
		}
		findings = append(findings, map[string]any{"id": id, "targetId": provider.Data["targetId"], "reason": reason})
	}
	return map[string]any{"checkedAt": now, "findings": findings}, nil
}

// FinancialSummary reports captured money; unknown fees and settlements are null, never zero.
func FinancialSummary(store Store, owner string) (map[string]any, error) {
	payments, err := store.List("payment", owner, nil)
	if err != nil {
		return nil, err
	}
	refunds, err := store.List("refund", owner, nil)
	if err != nil {
		return nil, err
	}
	statements, err := store.List("statement", owner, Where{"ready": true, "source": "channel"})
	if err != nil {
		return nil, err
	}
	settlements, err := store.List("settlement", owner, nil)
	if err != nil {
		return nil, err
	}
	findings, err := store.List("reconciliation", owner, nil)
	if err != nil {
		return nil, err
	}
	captured, refunded, reserved := 0, 0, 0
	paymentItems := []any{}
	for _, row := range payments {
		data := row.Data
		if str(data, "status") == "succeeded" {
			captured += num(data, "amount")
			refunded += num(data, "refunded")
			reserved += num(data, "reserved")
		}
		paymentItems = append(paymentItems, map[string]any{"id": row.ID, "reference": data["reference"], "amount": data["amount"],
			"status": data["status"], "refunded": data["refunded"], "reserved": data["reserved"], "createdAt": data["createdAt"]})
	}
	refundItems := []any{}
	for _, row := range refunds {
		item := map[string]any{"id": row.ID}
		for key, value := range row.Data {
			if key != "fingerprint" {
				item[key] = value
			}
		}
		refundItems = append(refundItems, item)
	}
	var fees, settled any
	if len(statements) > 0 {
		total := 0
		for _, row := range statements {
			total += num(row.Data, "fees")
		}
		fees = total
	}
	if len(settlements) > 0 {
		total := 0
		for _, row := range settlements {
			total += num(row.Data, "amount")
		}
		settled = total
	}
	return map[string]any{"currency": "CNY", "unit": "minor", "provider": "mock",
		"captured": captured, "refunded": refunded, "refundReserved": reserved, "fees": fees, "settled": settled,
		"payments": paymentItems, "refunds": refundItems, "findings": findings}, nil
}
