package coursecredit

import (
	"kanyue.server/internal/jsx"
)

// Hono's courseCredits/domain rules for batch quantities, activation and
// expiry, over batches as decoded record maps.

// dateOf is asDate: a required valid date in milliseconds.
func dateOf(value any, name string) (int64, error) {
	invalid := Fail("INVALID_DATE", name+" must be a valid date", map[string]any{"name": name, "value": value})
	if value == nil || value == "" {
		return 0, invalid
	}
	if number, ok := value.(float64); ok {
		return int64(number), nil
	}
	ms, ok := millis(value)
	if !ok {
		return 0, invalid
	}
	return ms, nil
}

// optionalDateOf is optionalDate; ok is false for a blank value.
func optionalDateOf(value any, name string) (int64, bool, error) {
	if value == nil || value == "" {
		return 0, false, nil
	}
	ms, err := dateOf(value, name)
	return ms, err == nil, err
}

func activationDeadlinePassed(batch map[string]any, at any) (bool, error) {
	deadline, ok, err := optionalDateOf(batch["activationDeadline"], "activationDeadline")
	if err != nil || !ok {
		return false, err
	}
	value, err := dateOf(at, "value")
	if err != nil {
		return false, err
	}
	return value >= deadline, nil
}

// canConsumeProtectedReservation: a reservation stays valid when its session starts inside the batch's validity.
func canConsumeProtectedReservation(batch map[string]any, reservedForStartAt any) (bool, error) {
	if !jsx.Truthy(reservedForStartAt) {
		return false, Fail("RESERVATION_START_REQUIRED", "reservedForStartAt is required", nil)
	}
	value, err := dateOf(reservedForStartAt, "value")
	if err != nil {
		return false, err
	}
	start, hasStart, err := optionalDateOf(batch["validFrom"], "start")
	if err != nil {
		return false, err
	}
	end, hasEnd, err := optionalDateOf(batch["effectiveExpiresAt"], "end")
	if err != nil {
		return false, err
	}
	return (!hasStart || value >= start) && (!hasEnd || value < end), nil
}

// expireAvailableQuantity moves all available quantity of a due batch to expired.
func expireAvailableQuantity(batch map[string]any, at string) (map[string]any, float64, error) {
	if err := validateBatchQuantities(batch); err != nil {
		return nil, 0, err
	}
	expiry, hasExpiry, err := optionalDateOf(batch["effectiveExpiresAt"], "effectiveExpiresAt")
	if err != nil {
		return nil, 0, err
	}
	expiredByDate := false
	if hasExpiry {
		value, err := dateOf(at, "value")
		if err != nil {
			return nil, 0, err
		}
		expiredByDate = value >= expiry
	}
	expiredBeforeActivation := false
	if !jsx.Truthy(batch["activatedAt"]) {
		if expiredBeforeActivation, err = activationDeadlinePassed(batch, at); err != nil {
			return nil, 0, err
		}
	}
	available := batch["availableQuantity"].(float64)
	if (!expiredByDate && !expiredBeforeActivation) || available == 0 {
		return copyMap(batch), 0, nil
	}
	moved, err := moveQuantity(batch, "availableQuantity", "expiredQuantity", available)
	if err != nil {
		return nil, 0, err
	}
	if moved["status"], err = deriveBatchStatus(moved); err != nil {
		return nil, 0, err
	}
	return moved, available, nil
}

func nonNegativeQuantity(value any, name string) (float64, error) {
	if !isInt(value) || value.(float64) < 0 {
		return 0, Fail("INVALID_CREDIT_QUANTITY", name+" must be a non-negative integer", map[string]any{"name": name, "value": value})
	}
	return value.(float64), nil
}

func validateBatchQuantities(batch map[string]any) error {
	original, err := nonNegativeQuantity(batch["originalQuantity"], "originalQuantity")
	if err != nil {
		return err
	}
	total := 0.0
	for _, bucket := range bucketNames {
		quantity, err := nonNegativeQuantity(batch[bucket], bucket)
		if err != nil {
			return err
		}
		total += quantity
	}
	if total != original {
		return Fail("BATCH_QUANTITY_MISMATCH", "batch quantities must conserve original quantity",
			map[string]any{"originalQuantity": original, "bucketTotal": total})
	}
	return nil
}

func moveQuantity(batch map[string]any, from, to string, quantity float64) (map[string]any, error) {
	if _, err := nonNegativeQuantity(quantity, "quantity"); err != nil {
		return nil, err
	}
	if quantity <= 0 {
		return nil, Fail("INVALID_CREDIT_QUANTITY", "quantity must be greater than zero", nil)
	}
	if err := validateBatchQuantities(batch); err != nil {
		return nil, err
	}
	available := batch[from].(float64)
	if available < quantity {
		return nil, Fail("CREDIT_INSUFFICIENT", from+" does not contain enough quantity",
			map[string]any{"available": available, "requested": quantity})
	}
	next := copyMap(batch)
	next[from] = available - quantity
	next[to] = batch[to].(float64) + quantity
	return next, validateBatchQuantities(next)
}

func deriveBatchStatus(batch map[string]any) (string, error) {
	if err := validateBatchQuantities(batch); err != nil {
		return "", err
	}
	original := batch["originalQuantity"]
	switch {
	case batch["reversedQuantity"] == original:
		return "cancelled", nil
	case batch["expiredQuantity"] == original:
		return "expired", nil
	case batch["availableQuantity"] == 0.0 && batch["frozenQuantity"] == 0.0:
		return "depleted", nil
	case jsx.Truthy(batch["activatedAt"]):
		return "active", nil
	}
	return "unactivated", nil
}
