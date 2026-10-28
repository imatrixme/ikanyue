// Package httpx keeps the response envelope Hono clients already depend on:
// {code, message, data}, code 10000 on success, HTTP 200 even for business errors.
package httpx

import (
	"database/sql"
	"errors"
	"log"
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

// DataMessage is Hono's c.data(data, message).
func DataMessage(e *core.RequestEvent, data any, message string) error {
	return e.JSON(http.StatusOK, envelope{Code: CodeOK, Message: message, Data: data})
}

func Error(e *core.RequestEvent, code int, message string) error {
	return e.JSON(http.StatusOK, envelope{Code: code, Message: message, Data: nil})
}

// SessionInvalid mirrors Hono's auth middleware so the mini program clears its session.
func SessionInvalid(e *core.RequestEvent, message string) error {
	return e.JSON(http.StatusOK, envelope{Code: 403, ErrorCode: "AUTH_SESSION_INVALID", Message: message, Data: nil})
}

// Internal mirrors Hono's app.onError for failures its handlers never caught.
func Internal(e *core.RequestEvent, err error) error {
	log.Printf("%s %s: %v", e.Request.Method, e.Request.URL.Path, err)
	return e.JSON(http.StatusInternalServerError, envelope{Code: 500, Message: "服务器内部错误", Data: nil})
}

// CodedError carries a client-facing envelope code and message.
type CodedError struct {
	Code    int
	Message string
}

func (e *CodedError) Error() string { return e.Message }

// Respond mirrors Hono's safe(): coded errors keep their code, a missing record is
// PocketBase's 404 message, anything else is logged and reported as a 500.
func Respond(e *core.RequestEvent, operation func() (any, error)) error {
	data, err := operation()
	if err == nil {
		return Data(e, data)
	}
	var coded *CodedError
	if errors.As(err, &coded) {
		return Error(e, coded.Code, coded.Message)
	}
	if errors.Is(err, sql.ErrNoRows) {
		return Error(e, 404, "The requested resource wasn't found.")
	}
	log.Printf("%s %s: %v", e.Request.Method, e.Request.URL.Path, err)
	return Error(e, 500, "服务器内部错误")
}
