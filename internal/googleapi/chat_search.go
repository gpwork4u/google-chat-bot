package googleapi

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"
)

// BrowserSession holds the credentials needed to call the Chat SPA's
// internal batchexecute RPCs from the backend. They come from a captured
// curl export (session.json); they expire when the user logs out or the
// browser rotates tokens, so stylesync logs and moves on when calls fail.
type BrowserSession struct {
	Cookies     string `json:"cookies"`      // full Cookie header value
	AtToken     string `json:"at"`            // f.req 'at' XSRF token
	FSID        string `json:"f_sid"`         // f.sid query param
	BL          string `json:"bl"`            // bl (boq_…) query param
	Ldap        string `json:"ldap"`          // search target (usually own ldap)
	AccountBase string `json:"account_base"`  // default "/u/0"
	UserAgent   string `json:"user_agent"`    // optional
}

// SearchOwnMessages calls rpcids=SBNmJb (sender-ldap search). beforeMs is
// the upper-bound timestamp — pass the oldest timestamp from the previous
// page to paginate backwards. pageSize matches the SPA default of 97.
//
// Returns the raw response body; caller feeds it to
// parser.ParseBatchExecuteSBNmJb.
func (s *BrowserSession) SearchOwnMessages(ctx context.Context, beforeMs int64, pageSize int) ([]byte, error) {
	if pageSize <= 0 || pageSize > 200 {
		pageSize = 97
	}
	if s.Ldap == "" {
		return nil, fmt.Errorf("browser session: ldap not set")
	}
	accountBase := s.AccountBase
	if accountBase == "" {
		accountBase = "/u/0"
	}

	uuid := newUUID()
	// inner[3]=ldap, inner[5]=uuid, inner[6]=[[],null,null,null,uuid,null,0],
	// inner[7]=beforeMs, inner[8]=[3], inner[9]=[pageSize]
	innerBytes, err := json.Marshal([]any{
		nil, nil, nil, s.Ldap, nil, uuid,
		[]any{[]any{}, nil, nil, nil, uuid, nil, 0},
		beforeMs, []any{3}, []any{pageSize},
	})
	if err != nil {
		return nil, err
	}
	fReq, err := json.Marshal([]any{[]any{[]any{"SBNmJb", string(innerBytes), nil, "3"}}})
	if err != nil {
		return nil, err
	}
	reqID := nextReqID()

	q := url.Values{}
	q.Set("rpcids", "SBNmJb")
	q.Set("source-path", "/u/0/app/search")
	q.Set("f.sid", s.FSID)
	q.Set("bl", s.BL)
	q.Set("hl", "en")
	q.Set("_reqid", fmt.Sprintf("%d", reqID))
	q.Set("rt", "c")

	endpoint := "https://chat.google.com" + accountBase + "/_/DynamiteWebUi/data/batchexecute?" + q.Encode()

	form := url.Values{}
	form.Set("f.req", string(fReq))
	form.Set("at", s.AtToken)

	httpReq, err := http.NewRequestWithContext(ctx, "POST", endpoint, strings.NewReader(form.Encode()+"&"))
	if err != nil {
		return nil, err
	}
	httpReq.Header.Set("Content-Type", "application/x-www-form-urlencoded;charset=UTF-8")
	httpReq.Header.Set("Origin", "https://chat.google.com")
	httpReq.Header.Set("Referer", "https://chat.google.com/")
	httpReq.Header.Set("X-Same-Domain", "1")
	if s.Cookies != "" {
		httpReq.Header.Set("Cookie", s.Cookies)
	}
	if s.UserAgent != "" {
		httpReq.Header.Set("User-Agent", s.UserAgent)
	}

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(httpReq)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode != 200 {
		preview := body
		if len(preview) > 200 {
			preview = preview[:200]
		}
		return nil, fmt.Errorf("batchexecute SBNmJb %d: %s", resp.StatusCode, preview)
	}
	return body, nil
}

// Request counter that mimics the SPA's _reqid increment — each call must
// use a different value, though any numeric id works.
var reqIDCounter int64 = 1000000

func nextReqID() int64 {
	// atomic-ish increment in a single process; races are harmless because
	// the server doesn't require a strict order, just uniqueness per call.
	reqIDCounter += 1000
	return reqIDCounter
}

func newUUID() string {
	var b [16]byte
	if _, err := rand.Read(b[:]); err != nil {
		// crypto/rand failures are effectively impossible on modern OSes
		return "00000000-0000-0000-0000-000000000000"
	}
	// RFC 4122 v4
	b[6] = (b[6] & 0x0f) | 0x40
	b[8] = (b[8] & 0x3f) | 0x80
	hx := hex.EncodeToString(b[:])
	return strings.ToUpper(hx[0:8] + "-" + hx[8:12] + "-" + hx[12:16] + "-" + hx[16:20] + "-" + hx[20:32])
}

// LoadSession reads a session.json file. An empty path returns nil with
// no error, so callers can treat session as optional.
func LoadSession(path string) (*BrowserSession, error) {
	if path == "" {
		return nil, nil
	}
	data, err := readFile(path)
	if err != nil {
		return nil, err
	}
	var sess BrowserSession
	dec := json.NewDecoder(bytes.NewReader(data))
	dec.DisallowUnknownFields()
	if err := dec.Decode(&sess); err != nil {
		return nil, fmt.Errorf("parse %s: %w", path, err)
	}
	if strings.TrimSpace(sess.Cookies) == "" || sess.Ldap == "" {
		return nil, fmt.Errorf("session file %s missing cookies or ldap", path)
	}
	return &sess, nil
}

// readFile is factored out for easier test mocking.
var readFile = func(path string) ([]byte, error) {
	return os.ReadFile(path)
}
