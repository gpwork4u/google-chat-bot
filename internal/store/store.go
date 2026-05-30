// Package store is the persistence layer. Backed by SQLite (modernc.org/sqlite,
// pure-Go, no cgo). Earlier versions targeted Postgres via pgx; we kept the
// pgx-style call signatures (Exec/Query/QueryRow taking ctx + query + args
// with $1/$2 placeholders) and translate them at the boundary, so the caller
// code in this package didn't have to change wholesale.
package store

import (
	"context"
	"database/sql"
	"embed"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"time"

	_ "modernc.org/sqlite"
)

//go:embed migrations/*.sql
var migrationsFS embed.FS

// ErrNoRows is the sentinel returned by QueryRow().Scan() when no row matched.
// Mirrors the old pgx.ErrNoRows symbol so call sites that imported it
// transitively can be rewritten in one sed pass.
var ErrNoRows = sql.ErrNoRows

// DB wraps a database/sql handle and exposes pgx-shaped helper methods so the
// existing call sites compile unchanged.
type DB struct {
	sqlDB *sql.DB
}

// Open accepts either a sqlite-style DSN (`file:./data/chatbot.db?...` or
// path), or a legacy Postgres URL prefix `postgres://` — in the latter case we
// derive a local sqlite path so existing configs keep working without env
// changes.
func Open(ctx context.Context, dsn string) (*DB, error) {
	path, opts := resolveSQLitePath(dsn)
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return nil, fmt.Errorf("mkdir data dir: %w", err)
	}
	// Tune for our workload: single writer, WAL for concurrent readers,
	// foreign keys on (matches the previous Postgres semantics).
	url := fmt.Sprintf("file:%s?%s", path, opts)
	sqlDB, err := sql.Open("sqlite", url)
	if err != nil {
		return nil, err
	}
	// One writer connection avoids "database is locked" under concurrent
	// transactional writes; SQLite serializes writes anyway.
	sqlDB.SetMaxOpenConns(1)
	sqlDB.SetConnMaxLifetime(time.Hour)
	if err := sqlDB.PingContext(ctx); err != nil {
		return nil, err
	}
	return &DB{sqlDB: sqlDB}, nil
}

// resolveSQLitePath converts whatever DSN config gives us into a (path,
// querystring) pair suitable for `file:` URLs.
func resolveSQLitePath(dsn string) (path, opts string) {
	defaultOpts := "_pragma=busy_timeout(5000)&_pragma=journal_mode(WAL)&_pragma=synchronous(NORMAL)&_pragma=foreign_keys(ON)&_time_format=sqlite"
	dsn = strings.TrimSpace(dsn)
	if dsn == "" || strings.HasPrefix(dsn, "postgres://") || strings.HasPrefix(dsn, "postgresql://") {
		return "./data/chatbot.db", defaultOpts
	}
	if strings.HasPrefix(dsn, "file:") {
		dsn = strings.TrimPrefix(dsn, "file:")
	}
	if i := strings.Index(dsn, "?"); i >= 0 {
		return dsn[:i], dsn[i+1:]
	}
	return dsn, defaultOpts
}

// Close releases the underlying handle.
func (db *DB) Close() {
	if db.sqlDB != nil {
		_ = db.sqlDB.Close()
	}
}

// Exec runs a non-result query, rewriting pgx-style $N placeholders to ? on
// the way through.
func (db *DB) Exec(ctx context.Context, query string, args ...any) (sql.Result, error) {
	return db.sqlDB.ExecContext(ctx, translatePlaceholders(query), normalizeArgs(args)...)
}

// Query runs a multi-row query.
func (db *DB) Query(ctx context.Context, query string, args ...any) (*sql.Rows, error) {
	return db.sqlDB.QueryContext(ctx, translatePlaceholders(query), normalizeArgs(args)...)
}

// QueryRow runs a single-row query.
func (db *DB) QueryRow(ctx context.Context, query string, args ...any) *sql.Row {
	return db.sqlDB.QueryRowContext(ctx, translatePlaceholders(query), normalizeArgs(args)...)
}

// normalizeArgs is currently a passthrough — the modernc.org/sqlite driver
// handles time.Time bind/scan when configured with _time_format in the DSN.
// Kept as a hook for future arg coercions.
func normalizeArgs(args []any) []any {
	return args
}

// parseSQLiteTime parses one of the formats the SQLite driver may return as a
// string when the column type can't be inferred (e.g. aggregate functions
// like MAX(timestamp_col)). Tries the formats modernc.org/sqlite writes plus
// RFC3339 fallback.
func parseSQLiteTime(s string) (time.Time, error) {
	if s == "" {
		return time.Time{}, nil
	}
	layouts := []string{
		"2006-01-02 15:04:05.999999999 -0700 MST", // Go time.Time.String()
		"2006-01-02 15:04:05.999999999",
		"2006-01-02 15:04:05.999",
		"2006-01-02 15:04:05",
		time.RFC3339Nano,
		time.RFC3339,
		"2006-01-02T15:04:05.999Z",
	}
	for _, layout := range layouts {
		if t, err := time.Parse(layout, s); err == nil {
			return t, nil
		}
	}
	return time.Time{}, fmt.Errorf("parseSQLiteTime: unrecognized format %q", s)
}

// BeginTx exposes a transaction; pgx-shaped Tx wrapper would be a small layer
// on top of *sql.Tx but no callers currently need transactions, so we expose
// the std driver type directly.
func (db *DB) BeginTx(ctx context.Context, opts *sql.TxOptions) (*sql.Tx, error) {
	return db.sqlDB.BeginTx(ctx, opts)
}

// translatePlaceholders rewrites Postgres-style $1, $2, ... into the ?, ?, ...
// form SQLite expects, plus a handful of function-name swaps (NOW() →
// CURRENT_TIMESTAMP, etc) we left in query strings throughout the package.
// We keep callers writing $N + NOW() because that's how the historical query
// strings are laid out.
var (
	pgPlaceholderRE = regexp.MustCompile(`\$(\d+)`)
	pgNowRE         = regexp.MustCompile(`(?i)\bNOW\(\)`)
	pgILikeRE       = regexp.MustCompile(`(?i)\bILIKE\b`)
	// `value::type` and `value :: type` style casts. SQLite is dynamically
	// typed so the cast is just noise — strip the suffix.
	pgCastRE = regexp.MustCompile(`(?i)::\s*(timestamptz|timestamp|interval|int(?:eger)?|bigint|float|double precision|text|jsonb|json|uuid|bytea|boolean|bool)`)
	// `NOW() ± INTERVAL 'N unit'` → `datetime('now', '±N unit')`.
	pgIntervalNowRE = regexp.MustCompile(`(?i)\bNOW\(\)\s*([+-])\s*INTERVAL\s+'(\d+\s*\w+)'`)
	// `$N ± INTERVAL 'N unit'` (typically `$N::timestamptz - INTERVAL 'x'` after
	// the cast has been stripped above).
	pgIntervalParamRE = regexp.MustCompile(`(?i)\$(\d+)\s*([+-])\s*INTERVAL\s+'(\d+\s*\w+)'`)
)

func translatePlaceholders(q string) string {
	// Order matters: strip ::casts first so the INTERVAL rewrites see a clean
	// `$N - INTERVAL '...'` shape after `$N::timestamptz - INTERVAL '...'`.
	q = pgCastRE.ReplaceAllString(q, "")
	q = pgIntervalNowRE.ReplaceAllStringFunc(q, func(m string) string {
		sub := pgIntervalNowRE.FindStringSubmatch(m)
		// sub[1] = sign, sub[2] = "N unit"
		return "datetime('now', '" + sub[1] + sub[2] + "')"
	})
	q = pgIntervalParamRE.ReplaceAllStringFunc(q, func(m string) string {
		sub := pgIntervalParamRE.FindStringSubmatch(m)
		// sub[1] = N (param index), sub[2] = sign, sub[3] = "N unit"
		return "datetime($" + sub[1] + ", '" + sub[2] + sub[3] + "')"
	})
	// $N → ?N. SQLite supports numbered placeholders so out-of-order
	// references in the SQL (e.g. WHERE x=$1 SET y=$2,z=$3) still bind to the
	// caller's positional args[0..N-1] correctly — flat ? would silently mis-
	// bind by SQL-declaration order.
	q = pgPlaceholderRE.ReplaceAllString(q, "?$1")
	q = pgNowRE.ReplaceAllString(q, "CURRENT_TIMESTAMP")
	q = pgILikeRE.ReplaceAllString(q, "LIKE")
	return q
}

// Migrate applies pending migrations in order. Each .sql file in migrations/
// is rewritten on the fly from Postgres syntax to SQLite syntax before
// execution (JSONB → TEXT, TIMESTAMPTZ → TIMESTAMP, NOW() → CURRENT_TIMESTAMP,
// BIGSERIAL → INTEGER PRIMARY KEY AUTOINCREMENT, etc).
func Migrate(ctx context.Context, db *DB) error {
	if _, err := db.Exec(ctx, `CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)`); err != nil {
		return err
	}
	entries, err := migrationsFS.ReadDir("migrations")
	if err != nil {
		return err
	}
	names := make([]string, 0, len(entries))
	for _, e := range entries {
		if e.IsDir() || strings.HasSuffix(e.Name(), ".down.sql") {
			continue
		}
		names = append(names, e.Name())
	}
	sort.Strings(names)
	for _, name := range names {
		var exists bool
		if err := db.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE name=$1)`, name).Scan(&exists); err != nil {
			return err
		}
		if exists {
			continue
		}
		content, err := migrationsFS.ReadFile("migrations/" + name)
		if err != nil {
			return err
		}
		rewritten := rewritePgDDL(string(content))
		rewritten = expandMultiAddColumn(rewritten)
		for _, stmt := range splitStatements(rewritten) {
			if strings.TrimSpace(stmt) == "" {
				continue
			}
			if _, err := db.Exec(ctx, stmt); err != nil {
				return fmt.Errorf("migration %s: %w\nstmt: %s", name, err, stmt)
			}
		}
		if _, err := db.Exec(ctx, `INSERT INTO schema_migrations(name) VALUES ($1)`, name); err != nil {
			return err
		}
	}
	return nil
}

// rewritePgDDL transforms common Postgres-specific DDL keywords to their
// SQLite equivalents. Best-effort; complex things (CHECK constraints with
// regex, etc) may need manual care but the existing migrations only use
// vanilla DDL.
func rewritePgDDL(s string) string {
	rules := []struct {
		re   *regexp.Regexp
		repl string
	}{
		{regexp.MustCompile(`(?i)BIGSERIAL\s+PRIMARY\s+KEY`), "INTEGER PRIMARY KEY AUTOINCREMENT"},
		{regexp.MustCompile(`(?i)\bBIGSERIAL\b`), "INTEGER"},
		{regexp.MustCompile(`(?i)\bSERIAL\b`), "INTEGER"},
		{regexp.MustCompile(`(?i)\bJSONB\b`), "TEXT"},
		{regexp.MustCompile(`(?i)\bJSON\b`), "TEXT"},
		{regexp.MustCompile(`(?i)\bTIMESTAMPTZ\b`), "TIMESTAMP"},
		{regexp.MustCompile(`(?i)TIMESTAMP\s+WITH\s+TIME\s+ZONE`), "TIMESTAMP"},
		{regexp.MustCompile(`(?i)\bNOW\(\)`), "CURRENT_TIMESTAMP"},
		{regexp.MustCompile(`(?i)\bBOOLEAN\b`), "INTEGER"},
		{regexp.MustCompile(`(?i)\bBOOL\b`), "INTEGER"},
		// pgvector — not supported on SQLite; the existing migrations don't
		// actually use it but we strip just in case.
		{regexp.MustCompile(`(?i)\bvector\(\d+\)`), "TEXT"},
		// CREATE EXTENSION statements are Postgres-only; drop them entirely.
		{regexp.MustCompile(`(?im)^\s*CREATE\s+EXTENSION[^;]*;?\s*$`), ""},
		// SQLite's ADD COLUMN doesn't accept IF NOT EXISTS. Migrations are
		// only ever applied once thanks to schema_migrations bookkeeping, so
		// the qualifier is redundant — strip it.
		{regexp.MustCompile(`(?i)ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS`), "ADD COLUMN"},
		{regexp.MustCompile(`(?i)DROP\s+COLUMN\s+IF\s+EXISTS`), "DROP COLUMN"},
		// SQLite doesn't have named constraints to DROP; any
		// ALTER TABLE ... DROP CONSTRAINT [IF EXISTS] x statement is dropped.
		{regexp.MustCompile(`(?im)^\s*ALTER\s+TABLE[^;]*DROP\s+CONSTRAINT[^;]*;?\s*$`), ""},
		{regexp.MustCompile(`(?im)^\s*ALTER\s+TABLE[^;]*ADD\s+CONSTRAINT[^;]*;?\s*$`), ""},
		// UPDATE ... FROM ... is Postgres-specific. Migrations use these for
		// optional backfills on existing data; on a fresh SQLite install the
		// tables are empty so the UPDATE has nothing to do. Drop it.
		{regexp.MustCompile(`(?is)UPDATE\s+\w+\s+\w*\s*SET\s+[^;]*\bFROM\s+[^;]*;`), ""},
		// DEFAULT FALSE / DEFAULT TRUE → DEFAULT 0 / 1 (we also remap BOOLEAN
		// to INTEGER above).
		{regexp.MustCompile(`(?i)DEFAULT\s+FALSE\b`), "DEFAULT 0"},
		{regexp.MustCompile(`(?i)DEFAULT\s+TRUE\b`), "DEFAULT 1"},
		// COMMENT ON ... — Postgres-only metadata; SQLite has no equivalent.
		{regexp.MustCompile(`(?is)COMMENT\s+ON\s+[^;]*;`), ""},
		// pg_trgm GIN indexes on a column-expression — SQLite doesn't have GIN;
		// the closest is a regular index, which is fine for our row counts.
		{regexp.MustCompile(`(?i)USING\s+GIN[^,)]*`), ""},
		{regexp.MustCompile(`(?i)USING\s+GIST[^,)]*`), ""},
		// gen_random_uuid() — not available; we don't actually use it but be defensive
		{regexp.MustCompile(`(?i)\bgen_random_uuid\(\)`), "''"},
	}
	for _, r := range rules {
		s = r.re.ReplaceAllString(s, r.repl)
	}
	return s
}

// expandMultiAddColumn turns
//
//	ALTER TABLE t ADD COLUMN a INT, ADD COLUMN b TEXT;
//
// into
//
//	ALTER TABLE t ADD COLUMN a INT;
//	ALTER TABLE t ADD COLUMN b TEXT;
//
// which is what SQLite needs (it accepts only one ADD COLUMN per ALTER TABLE).
// We scan statement-by-statement so we don't accidentally split a single
// ADD COLUMN whose default value contains a comma.
var multiAddRE = regexp.MustCompile(`(?is)ALTER\s+TABLE\s+(\S+)\s+(.+?);`)

func expandMultiAddColumn(s string) string {
	return multiAddRE.ReplaceAllStringFunc(s, func(match string) string {
		m := multiAddRE.FindStringSubmatch(match)
		if len(m) < 3 {
			return match
		}
		table := m[1]
		body := m[2]
		// Split by `, ADD COLUMN` while preserving the leading `ADD COLUMN`
		// on each piece. We use a regex with positive lookbehind-ish trick:
		// replace the comma-then-ADD-COLUMN boundary with a unique marker.
		marker := "\x00SPLIT\x00"
		boundary := regexp.MustCompile(`(?i),\s*ADD\s+COLUMN`)
		split := boundary.ReplaceAllString(body, marker+"ADD COLUMN")
		parts := strings.Split(split, marker)
		if len(parts) == 1 {
			return match // no expansion needed
		}
		var sb strings.Builder
		for _, p := range parts {
			sb.WriteString("ALTER TABLE ")
			sb.WriteString(table)
			sb.WriteByte(' ')
			sb.WriteString(strings.TrimSpace(p))
			sb.WriteString(";\n")
		}
		return sb.String()
	})
}

// splitStatements splits a multi-statement SQL string on `;` while respecting
// single-quoted strings AND `--` line comments. Migrations occasionally have
// `;` inside comments (e.g. natural-language semicolons) — those should not
// terminate a statement.
func splitStatements(s string) []string {
	var out []string
	var cur strings.Builder
	inSingle := false
	inLineComment := false
	for i := 0; i < len(s); i++ {
		c := s[i]
		if inLineComment {
			cur.WriteByte(c)
			if c == '\n' {
				inLineComment = false
			}
			continue
		}
		if !inSingle && c == '-' && i+1 < len(s) && s[i+1] == '-' {
			inLineComment = true
			cur.WriteByte(c)
			continue
		}
		if c == '\'' {
			inSingle = !inSingle
		}
		if c == ';' && !inSingle {
			out = append(out, cur.String())
			cur.Reset()
			continue
		}
		cur.WriteByte(c)
	}
	if strings.TrimSpace(cur.String()) != "" {
		out = append(out, cur.String())
	}
	return out
}

// keep errors import alive (used by callers indirectly via store.ErrNoRows)
var _ = errors.New
