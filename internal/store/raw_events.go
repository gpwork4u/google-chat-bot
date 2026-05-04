package store

import (
	"context"
	"encoding/json"
	"strings"
)

func (db *DB) InsertRawEvent(ctx context.Context, userID int64, kind, url string, payload json.RawMessage) error {
	const q = `INSERT INTO raw_events (user_id, kind, url, payload) VALUES ($1, $2, $3, $4)`
	var uid any
	if userID > 0 {
		uid = userID
	}
	_, err := db.Exec(ctx, q, uid, kind, url, payload)
	return err
}

// RawEventRow is a subset of raw_events columns used by the worker.
type RawEventRow struct {
	ID       int64
	Kind     string
	URL      string
	RespText string // payload->>'respText'
}

// RawEventsSince returns up to `limit` raw_events with id > lastID whose url
// matches the SQL LIKE pattern.
func (db *DB) RawEventsSince(ctx context.Context, lastID int64, urlLike string, limit int) ([]RawEventRow, error) {
	const q = `
SELECT id, kind, url, COALESCE(payload->>'respText', '') AS resp_text
FROM raw_events
WHERE id > $1 AND url LIKE $2
ORDER BY id
LIMIT $3`
	rows, err := db.Query(ctx, q, lastID, urlLike, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []RawEventRow
	for rows.Next() {
		var r RawEventRow
		if err := rows.Scan(&r.ID, &r.Kind, &r.URL, &r.RespText); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// PeekRawEventRow is the shape returned by the debug peek endpoint — full
// payload JSON so callers can reverse-engineer new RPC request/response
// formats without needing psql.
type PeekRawEventRow struct {
	ID       int64           `json:"id"`
	Kind     string          `json:"kind"`
	URL      string          `json:"url"`
	RespText string          `json:"resp_text"`
	ReqBody  string          `json:"req_body,omitempty"`
	Payload  json.RawMessage `json:"payload"`
}

// PeekRawEvents returns the newest raw_events matching urlLike (SQL LIKE
// pattern), with payload JSON truncated field-by-field to maxBytes to
// keep response size bounded. Used by /debug/raw_events.
func (db *DB) PeekRawEvents(ctx context.Context, urlLike string, limit, maxBytes int) ([]PeekRawEventRow, error) {
	if limit <= 0 {
		limit = 3
	}
	const q = `
SELECT
  id, kind, url,
  LEFT(COALESCE(payload->>'respText', ''), $3) AS resp_text,
  LEFT(COALESCE(payload->>'reqBody',  ''), $3) AS req_body,
  payload
FROM raw_events
WHERE url LIKE $1
ORDER BY id DESC
LIMIT $2`
	rows, err := db.Query(ctx, q, urlLike, limit, maxBytes)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []PeekRawEventRow
	for rows.Next() {
		var r PeekRawEventRow
		if err := rows.Scan(&r.ID, &r.Kind, &r.URL, &r.RespText, &r.ReqBody, &r.Payload); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// MaxRawEventID returns the current max(id) of raw_events (0 if empty).
func (db *DB) MaxRawEventID(ctx context.Context) (int64, error) {
	var id int64
	err := db.QueryRow(ctx, `SELECT COALESCE(MAX(id), 0) FROM raw_events`).Scan(&id)
	return id, err
}

// ResolveCreateTopicSpaceRef finds the internal room token structure that
// Google Chat's create_topic endpoint expects. It first tries the same thread,
// then falls back to any historically successful thread in the same space.
func (db *DB) ResolveCreateTopicSpaceRef(ctx context.Context, userID int64, spaceKey, threadKey string) (json.RawMessage, error) {
	tryThreads := []string{}
	seen := map[string]bool{}
	addThread := func(v string) {
		v = strings.TrimSpace(v)
		if v == "" || seen[v] {
			return
		}
		seen[v] = true
		tryThreads = append(tryThreads, v)
	}
	addThread(threadKey)

	rows, err := db.Query(ctx,
		`SELECT DISTINCT thread_key FROM messages WHERE user_id=$1 AND space_key=$2 AND thread_key <> '' ORDER BY thread_key`,
		userID, spaceKey,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var tk string
		if err := rows.Scan(&tk); err != nil {
			return nil, err
		}
		addThread(tk)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	for _, tk := range tryThreads {
		ref, err := db.lookupCreateTopicSpaceRefByThread(ctx, tk)
		if err != nil {
			return nil, err
		}
		if len(ref) > 0 {
			return ref, nil
		}
	}
	return nil, nil
}

func (db *DB) lookupCreateTopicSpaceRefByThread(ctx context.Context, threadKey string) (json.RawMessage, error) {
	const q = `
SELECT payload->>'reqBody' AS req_body
FROM raw_events
WHERE url LIKE '%create_topic%'
  AND COALESCE(payload->>'respText', '') LIKE '%dfe.t.ct%'
  AND COALESCE(payload->>'reqBody', '') LIKE '%' || $1 || '%'
ORDER BY id DESC
LIMIT 20`
	rows, err := db.Query(ctx, q, `"`+threadKey+`"`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var body string
		if err := rows.Scan(&body); err != nil {
			return nil, err
		}
		var arr []any
		if err := json.Unmarshal([]byte(body), &arr); err != nil {
			continue
		}
		if len(arr) <= 4 {
			continue
		}
		raw, err := json.Marshal(arr[4])
		if err != nil || string(raw) == "null" {
			continue
		}
		return raw, nil
	}
	return nil, rows.Err()
}
