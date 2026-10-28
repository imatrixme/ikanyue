package points

import (
	"errors"
	"mime/multipart"
	"net/http"
	"strings"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/filesystem"

	"kanyue.server/internal/httpx"
	"kanyue.server/internal/jsx"
	"kanyue.server/internal/records"
)

const maxRewardImageSize = 5 * 1024 * 1024

var rewardImageTypes = map[string]bool{
	"image/jpeg": true, "image/png": true, "image/webp": true, "image/gif": true, "image/avif": true,
}

func (m Module) listRewards(e *core.RequestEvent) (any, error) {
	if err := assertAdmin(e); err != nil {
		return nil, err
	}
	query := e.Request.URL.Query()
	perPage := query.Get("perPage")
	if perPage == "" {
		perPage = query.Get("limit")
	}
	result, err := records.Page(e.App, rewardItems, "", "sortOrder", positivePage(query.Get("page"), 1), positivePage(perPage, 50))
	if err != nil {
		return nil, err
	}
	items := make([]map[string]any, 0, len(result.Items))
	for _, record := range result.Items {
		items = append(items, m.adminReward(record))
	}
	return map[string]any{"items": items, "page": result.Page, "perPage": result.PerPage,
		"totalItems": result.TotalItems, "totalPages": result.TotalPages}, nil
}

// availability splits active rewards by whether the balance covers them.
func (m Module) availability(app core.App, balance float64) (any, error) {
	result, err := records.Page(app, rewardItems, `status = "active"`, "sortOrder", 1, 200)
	if err != nil {
		return nil, err
	}
	locked, redeemable := []map[string]any{}, []map[string]any{}
	for _, record := range result.Items {
		item := m.publicReward(record)
		if item["pointsPrice"].(float64) > balance {
			locked = append(locked, item)
		} else {
			redeemable = append(redeemable, item)
		}
	}
	return map[string]any{"currentPoints": balance, "lockedItems": locked, "redeemableItems": redeemable}, nil
}

func (m Module) createReward(e *core.RequestEvent, input httpx.Body) (any, error) {
	if err := assertAdmin(e); err != nil {
		return nil, err
	}
	payload, err := rewardPayload(input)
	if err != nil {
		return nil, err
	}
	target, err := e.App.FindCollectionByNameOrId(rewardItems)
	if err != nil {
		return nil, err
	}
	record := core.NewRecord(target)
	record.Load(payload)
	if err := e.App.Save(record); err != nil {
		return nil, err
	}
	return m.adminReward(record), nil
}

// updateReward merges the input over the stored item before validating, like Hono.
func (m Module) updateReward(e *core.RequestEvent, id string, input httpx.Body) (any, error) {
	if err := assertAdmin(e); err != nil {
		return nil, err
	}
	rewardID, err := requireID(id, "实物不能为空")
	if err != nil {
		return nil, err
	}
	record, err := e.App.FindRecordById(rewardItems, rewardID)
	if err != nil {
		return nil, err
	}
	merged := records.JSON(record)
	for key, value := range input {
		merged[key] = value
	}
	payload, err := rewardPayload(merged)
	if err != nil {
		return nil, err
	}
	record.Load(payload)
	if err := e.App.Save(record); err != nil {
		return nil, err
	}
	return m.adminReward(record), nil
}

func (m Module) uploadImage(e *core.RequestEvent, id string) (any, error) {
	// Hono parses the body before any check; a non-multipart body parses as
	// empty, so it reads as a missing file.
	if err := e.Request.ParseMultipartForm(32 << 20); err != nil && !errors.Is(err, http.ErrNotMultipart) {
		return nil, userError(400, "图片上传请求解析失败")
	}
	if err := assertAdmin(e); err != nil {
		return nil, err
	}
	rewardID, err := requireID(id, "实物不能为空")
	if err != nil {
		return nil, err
	}
	var header *multipart.FileHeader
	for _, key := range []string{"imageFile", "image", "file"} {
		if e.Request.MultipartForm == nil {
			break
		}
		if files := e.Request.MultipartForm.File[key]; len(files) > 0 {
			header = files[0]
			break
		}
	}
	if header == nil {
		return nil, userError(400, "请选择实物图片")
	}
	if header.Size <= 0 {
		return nil, userError(400, "实物图片不能为空")
	}
	if header.Size > maxRewardImageSize {
		return nil, userError(400, "实物图片不能超过 5MB")
	}
	if !rewardImageTypes[strings.ToLower(header.Header.Get("Content-Type"))] {
		return nil, userError(400, "仅支持 JPG、PNG、WebP、GIF 或 AVIF 图片")
	}
	record, err := e.App.FindRecordById(rewardItems, rewardID)
	if err != nil {
		return nil, err
	}
	file, err := filesystem.NewFileFromMultipart(header)
	if err != nil {
		return nil, err
	}
	record.Set("imageFile", file)
	if err := e.App.Save(record); err != nil {
		return nil, err
	}
	return m.adminReward(record), nil
}

// activeReward is RewardService.getActiveReward.
func activeReward(app core.App, id any) (*core.Record, error) {
	rewardID, err := requireID(id, "实物不能为空")
	if err != nil {
		return nil, err
	}
	reward, err := app.FindRecordById(rewardItems, rewardID)
	if err != nil {
		return nil, err
	}
	if reward.GetString("status") != "active" {
		return nil, userError(400, "实物已下线，无法兑换")
	}
	if number(reward.Get("pointsPrice")) <= 0 {
		return nil, userError(400, "实物积分价格无效")
	}
	return reward, nil
}

func rewardPayload(input map[string]any) (map[string]any, error) {
	name := trimmed(input["name"])
	if !jsx.Truthy(input["name"]) {
		name = trimmed(input["title"])
	}
	if name == "" {
		return nil, userError(400, "实物名称不能为空")
	}
	price := jsx.Number(input["pointsPrice"])
	if !isPositiveInteger(price) {
		return nil, userError(400, "实物积分价格必须为正整数")
	}
	image := input["image"]
	if !jsx.Truthy(image) {
		image = input["imageUrl"]
	}
	status := "active"
	if input["status"] == "inactive" {
		status = "inactive"
	}
	return map[string]any{
		"description": trimmed(input["description"]),
		"image":       trimmed(image),
		"name":        name,
		"pointsPrice": price,
		"sortOrder":   number(input["sortOrder"]),
		"status":      status,
	}, nil
}

func (m Module) publicReward(record *core.Record) map[string]any {
	image := record.GetString("image")
	if files := record.GetStringSlice("imageFile"); len(files) > 0 && files[0] != "" {
		image = records.FileURL(record, files[0], m.PublicAssetBaseURL, m.PBPublicURL)
	}
	return map[string]any{
		"description": record.GetString("description"),
		"id":          record.Id,
		"image":       image,
		"name":        record.GetString("name"),
		"pointsPrice": number(record.Get("pointsPrice")),
	}
}

func (m Module) adminReward(record *core.Record) map[string]any {
	item := m.publicReward(record)
	item["sortOrder"] = number(record.Get("sortOrder"))
	item["status"] = "active"
	if record.GetString("status") == "inactive" {
		item["status"] = "inactive"
	}
	return item
}
