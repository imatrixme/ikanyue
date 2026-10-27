// Package httpx keeps the response envelope Hono clients already depend on:
// {code, message, data}, code 10000 on success, HTTP 200 even for business errors.
package httpx

import (
	"net/http"

	"github.com/pocketbase/pocketbase/core"
)

const CodeOK = 10000

type envelope struct {
	Code      int    `json:"code"`
	ErrorCode string `json:"errorCode,omitempty"`
	Message   any    `json:"message"`
	Data      any    `json:"data"`
}

func Data(e *core.RequestEvent, data any) error {
	return e.JSON(http.StatusOK, envelope{Code: CodeOK, Message: nil, Data: data})
}

func Error(e *core.RequestEvent, code int, message string) error {
	return e.JSON(http.StatusOK, envelope{Code: code, Message: message, Data: nil})
}

// SessionInvalid mirrors Hono's auth middleware so the mini program clears its session.
func SessionInvalid(e *core.RequestEvent, message string) error {
	return e.JSON(http.StatusOK, envelope{Code: 403, ErrorCode: "AUTH_SESSION_INVALID", Message: message, Data: nil})
}
