package venues

import (
	"bytes"
	"encoding/json"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"net/textproto"
	"strings"
	"testing"

	"kanyue.server/internal/auth"
	"kanyue.server/internal/testkit"
)

func uploadCover(t *testing.T, handler http.Handler, id, field, contentType string, content []byte, headers map[string]string) testkit.Response {
	t.Helper()
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	if field != "" {
		header := textproto.MIMEHeader{}
		header.Set("Content-Disposition", `form-data; name="`+field+`"; filename="cover.png"`)
		header.Set("Content-Type", contentType)
		part, _ := writer.CreatePart(header)
		_, _ = part.Write(content)
	}
	_ = writer.Close()
	request := httptest.NewRequest(http.MethodPost, "/ops/venues/"+id+"/cover", &body)
	request.Header.Set("Content-Type", writer.FormDataContentType())
	for key, value := range headers {
		request.Header.Set(key, value)
	}
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)
	result := testkit.Response{Status: recorder.Code, Body: map[string]any{}}
	if err := json.Unmarshal(recorder.Body.Bytes(), &result.Body); err != nil {
		t.Fatalf("invalid JSON %q", recorder.Body.String())
	}
	return result
}

func TestVenueCoverUploadAndPublicURL(t *testing.T) {
	app, _, token := venueSetup(t)
	signer, err := auth.NewSigner(testkit.Secret)
	if err != nil {
		t.Fatal(err)
	}
	handler := testkit.Serve(t, app, Module{Signer: signer, PublicAssetBaseURL: "https://assets.example.test/files"}.Register)
	png := []byte("\x89PNG\r\n\x1a\ncover-bytes")

	before := venueItems(testkit.Call(t, handler, http.MethodGet, "/v1/public/venues", nil, nil).Data())
	if before[0]["coverUrl"] != "" {
		t.Fatalf("a venue without a cover must return an empty coverUrl: %v", before[0])
	}

	data := uploadCover(t, handler, "venuea000000000", "cover", "image/png", png, token(true)).Data()
	cover, _ := data["coverUrl"].(string)
	if !strings.HasPrefix(cover, "https://assets.example.test/files/") || !strings.Contains(cover, "/venuea000000000/cover_") {
		t.Fatalf("upload = %v", data)
	}
	public := venueItems(testkit.Call(t, handler, http.MethodGet, "/v1/public/venues", nil, nil).Data())
	if public[0]["id"] != "venuea000000000" || public[0]["coverUrl"] != cover {
		t.Fatalf("public cover = %v", public[0])
	}

	// Saving the other fields keeps the cover.
	saved := testkit.Call(t, handler, http.MethodPost, "/ops/venues/venuea000000000", map[string]any{"name": "看乐艺术总店"}, token(true)).Data()
	if saved["coverUrl"] != cover || saved["name"] != "看乐艺术总店" {
		t.Fatalf("save must keep the cover: %v", saved)
	}

	checks := []struct {
		id, field, contentType string
		content                []byte
		admin                  bool
		code                   int
		message                string
	}{
		{"venuea000000000", "", "", nil, true, 400, "请选择封面图片"},
		{"venuea000000000", "cover", "image/png", []byte{}, true, 400, "封面图片不能为空"},
		{"venuea000000000", "cover", "image/png", bytes.Repeat([]byte("a"), 5*1024*1024+1), true, 400, "封面图片不能超过 5MB"},
		{"venuea000000000", "cover", "image/gif", png, true, 400, "仅支持 JPG、PNG 或 WebP 图片"},
		{"venuea000000000", "cover", "image/png", png, false, 403, "需要管理员权限"},
		{"%20", "cover", "image/png", png, true, 400, "场馆不能为空"},
	}
	for _, check := range checks {
		response := uploadCover(t, handler, check.id, check.field, check.contentType, check.content, token(check.admin))
		if response.Code() != check.code || response.Body["message"] != check.message {
			t.Fatalf("%s %s = %v", check.field, check.contentType, response.Body)
		}
	}
	if after := venueItems(testkit.Call(t, handler, http.MethodGet, "/v1/public/venues", nil, nil).Data()); after[0]["coverUrl"] != cover {
		t.Fatalf("rejected uploads must keep the cover: %v", after[0])
	}
}
