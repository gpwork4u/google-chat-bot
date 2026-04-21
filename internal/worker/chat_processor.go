// Package worker pulls raw Chat API responses out of the raw_events table,
// parses them, and inserts resulting messages + pending drafts.
package worker

import (
	"context"
	"encoding/json"
	"log/slog"
	"strings"
	"sync"
	"time"

	"github.com/ailabs-tw/google-chat-bot/internal/googleapi"
	"github.com/ailabs-tw/google-chat-bot/internal/hub"
	"github.com/ailabs-tw/google-chat-bot/internal/parser"
	"github.com/ailabs-tw/google-chat-bot/internal/store"
)

const (
	pollInterval  = 3 * time.Second // primary catch-up; push path (Ingest) is additive
	batchSize     = 200
	urlChatAPILK  = "%/api/%"
	urlGetGroupLK = "%get_group%"

	// freshnessWindow gates message inserts: anything older is dropped,
	// regardless of source (webchannel push, list_topics backfill,
	// batchexecute sender-search, HTTP fallback). Keeps the messages
	// table focused on the active working set and prevents historical
	// bulk imports from pushing noise into the pending queue.
	freshnessWindow = 30 * time.Minute
)

// isFresh reports whether t is within freshnessWindow of now. Zero time
// (unknown) passes so edge cases where we genuinely can't timestamp a
// message don't silently get dropped.
func isFresh(t time.Time) bool {
	if t.IsZero() {
		return true
	}
	return time.Since(t) <= freshnessWindow
}

type ChatProcessor struct {
	db              *store.DB
	hub             *hub.Hub
	mu              sync.Mutex // guards ingest ordering so ticker + push don't race
	lastID          int64
	userEmail       string
	userName        string
	userID          int64
	chatSessionFile string
}

const defaultLocalUserName = "Local Extension User"

func NewChatProcessor(db *store.DB, h *hub.Hub, localUserEmail, localUserName string) *ChatProcessor {
	return &ChatProcessor{
		db:        db,
		hub:       h,
		userEmail: strings.ToLower(localUserEmail),
		userName:  localUserName,
	}
}

// SetChatSessionFile enables the startup style-corpus sync. Pass an empty
// string to disable.
func (p *ChatProcessor) SetChatSessionFile(path string) {
	p.chatSessionFile = path
}

func (p *ChatProcessor) Run(ctx context.Context) {
	if err := p.ensureUser(ctx); err != nil {
		slog.Error("chat processor init failed", "err", err)
		return
	}

	if err := p.backfillSpaceNames(ctx); err != nil {
		slog.Warn("space-name backfill failed", "err", err)
	}
	if err := p.backfillMembers(ctx); err != nil {
		slog.Warn("members backfill failed", "err", err)
	}
	p.requestSpaceNameRefresh(ctx)
	if p.chatSessionFile != "" {
		go p.syncStyleCorpus(ctx, p.chatSessionFile)
	}
	p.requestInitialSenderSearch(ctx)

	// Start from 0 and let InsertOrGetMessage dedupe by message_key. This way
	// historical responses already in raw_events get backfilled on first run.
	p.lastID = 0
	slog.Info("chat processor started", "starting_from_id", p.lastID)

	ticker := time.NewTicker(pollInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			slog.Info("chat processor stopped")
			return
		case <-ticker.C:
			if err := p.tick(ctx); err != nil {
				slog.Error("worker tick", "err", err)
			}
		}
	}
}

func (p *ChatProcessor) ensureUser(ctx context.Context) error {
	if p.userID == 0 {
		u, err := p.db.EnsureLocalUser(ctx, p.userEmail, p.userName)
		if err != nil || u == nil {
			return err
		}
		if p.userEmail == "" {
			p.userEmail = strings.ToLower(u.Email)
		}
		p.userID = u.ID
	}
	return nil
}

// backfillMembers populates chat_members from everything we've already
// captured. Two sources:
//   1. list_topics responses — each message row carries sender name+email.
//   2. list_members responses that included the optional profile block
//      (triggered when the user opens the member directory / browse space).
//
// Called once on startup so webchannel push frames (which carry only
// sender_id) can be enriched with a display_name going forward.
func (p *ChatProcessor) backfillMembers(ctx context.Context) error {
	fromMessages, err := p.backfillMembersFromListTopics(ctx)
	if err != nil {
		return err
	}
	fromProfiles, err := p.backfillMembersFromListMembers(ctx)
	if err != nil {
		return err
	}
	count, _ := p.db.CountChatMembers(ctx, p.userID)
	slog.Info("members backfill completed",
		"from_list_topics", fromMessages,
		"from_list_members", fromProfiles,
		"directory_size", count)
	return nil
}

func (p *ChatProcessor) backfillMembersFromListTopics(ctx context.Context) (int, error) {
	var lastID int64
	var upserted int
	for {
		rows, err := p.db.RawEventsSince(ctx, lastID, "%list_topics%", batchSize)
		if err != nil {
			return upserted, err
		}
		if len(rows) == 0 {
			return upserted, nil
		}
		for _, row := range rows {
			if row.ID > lastID {
				lastID = row.ID
			}
			parsed, err := parser.ParseListTopicsResponse(row.RespText)
			if err != nil {
				continue
			}
			for _, m := range parsed {
				if m.SenderID == "" {
					continue
				}
				if err := p.db.UpsertChatMember(ctx, p.userID, m.SenderID, m.SenderName, m.SenderEmail); err != nil {
					slog.Warn("upsert chat member (list_topics)", "err", err, "member", m.SenderID)
					continue
				}
				upserted++
			}
		}
	}
}

func (p *ChatProcessor) backfillMembersFromListMembers(ctx context.Context) (int, error) {
	var lastID int64
	var upserted int
	for {
		rows, err := p.db.RawEventsSince(ctx, lastID, "%list_members%", batchSize)
		if err != nil {
			return upserted, err
		}
		if len(rows) == 0 {
			return upserted, nil
		}
		for _, row := range rows {
			if row.ID > lastID {
				lastID = row.ID
			}
			profiles, err := parser.ParseListMembersProfiles(row.RespText)
			if err != nil {
				continue
			}
			for _, prof := range profiles {
				if prof.ID == "" {
					continue
				}
				if err := p.db.UpsertChatMember(ctx, p.userID, prof.ID, prof.DisplayName, prof.Email); err != nil {
					slog.Warn("upsert chat member (list_members)", "err", err, "member", prof.ID)
					continue
				}
				upserted++
			}
		}
	}
}

func (p *ChatProcessor) backfillSpaceNames(ctx context.Context) error {
	var lastID int64
	var updated int
	for {
		rows, err := p.db.RawEventsSince(ctx, lastID, urlGetGroupLK, batchSize)
		if err != nil {
			return err
		}
		if len(rows) == 0 {
			break
		}
		for _, row := range rows {
			if row.ID > lastID {
				lastID = row.ID
			}
			space, err := parser.ParseGetGroupResponse(row.RespText)
			if err != nil {
				slog.Warn("parse get_group", "raw_event_id", row.ID, "err", err)
				continue
			}
			if space == nil || space.SpaceKey == "" || space.SpaceName == "" {
				continue
			}
			if err := p.db.UpsertSpaceName(ctx, p.userID, space.SpaceKey, space.SpaceName); err != nil {
				slog.Warn("update space name", "raw_event_id", row.ID, "space_key", space.SpaceKey, "err", err)
				continue
			}
			updated++
		}
	}
	slog.Info("space-name backfill completed", "raw_events_scanned_through", lastID, "updates_attempted", updated)
	return nil
}

func (p *ChatProcessor) tick(ctx context.Context) error {
	if err := p.ensureUser(ctx); err != nil {
		return err
	}

	rows, err := p.db.RawEventsSince(ctx, p.lastID, urlChatAPILK, batchSize)
	if err != nil {
		return err
	}
	if len(rows) == 0 {
		return nil
	}

	var maxSeen int64
	var inserted, drafted int
	for _, row := range rows {
		if row.ID > maxSeen {
			maxSeen = row.ID
		}
		if strings.Contains(row.URL, "list_topics") {
			parsed, err := parser.ParseListTopicsResponse(row.RespText)
			if err != nil {
				slog.Warn("parse list_topics", "raw_event_id", row.ID, "err", err)
				continue
			}
			for _, m := range parsed {
				inserted2, drafted2 := p.ingestMessage(ctx, m)
				inserted += inserted2
				drafted += drafted2
			}
			continue
		}

		if strings.Contains(row.URL, "get_group") {
			space, err := parser.ParseGetGroupResponse(row.RespText)
			if err != nil {
				slog.Warn("parse get_group", "raw_event_id", row.ID, "err", err)
				continue
			}
			if space != nil && space.SpaceKey != "" && space.SpaceName != "" {
				if err := p.db.UpsertSpaceName(ctx, p.userID, space.SpaceKey, space.SpaceName); err != nil {
					slog.Warn("update space name", "raw_event_id", row.ID, "space_key", space.SpaceKey, "err", err)
				}
			}
		}
	}
	p.lastID = maxSeen
	slog.Info("worker tick processed",
		"raw_events", len(rows),
		"messages_inserted", inserted,
		"drafts_created", drafted,
		"high_watermark", p.lastID)
	if p.hub != nil {
		if inserted > 0 {
			p.hub.InboxChanged()
		}
		if drafted > 0 {
			p.broadcastPending(ctx)
		}
	}
	return nil
}

// Ingest parses a single raw event payload (same shape as inject-main.js
// emits) on the hot path and broadcasts any resulting inbox updates. Called
// from the /ws/ext handler as soon as the extension observes a response;
// the ticker above is a fallback for anything this path missed.
//
// payload is the raw_events.payload JSON — at minimum it should include
// respText for API responses we care about.
func (p *ChatProcessor) Ingest(ctx context.Context, kind, url string, payload json.RawMessage) error {
	p.mu.Lock()
	defer p.mu.Unlock()

	if err := p.ensureUser(ctx); err != nil {
		return err
	}

	// webchannel-frame carries a pre-parsed BrowserChannel frame (see
	// inject-main.js). Handle it before the respText-based parsers below.
	if kind == "webchannel-frame" {
		return p.ingestWebchannelFrame(ctx, url, payload)
	}

	var env struct {
		RespText string `json:"respText"`
	}
	// best-effort: some payloads (e.g. ws-out, debug) have no respText and we just skip
	_ = json.Unmarshal(payload, &env)
	respText := env.RespText

	var inserted, drafted int
	switch {
	case strings.Contains(url, "list_topics"):
		parsed, err := parser.ParseListTopicsResponse(respText)
		if err != nil {
			slog.Warn("ingest parse list_topics", "err", err, "url", url, "respText_len", len(respText))
			return err
		}
		for _, m := range parsed {
			mi, di := p.ingestMessage(ctx, m)
			inserted += mi
			drafted += di
		}
		slog.Info("ingest push list_topics", "url", url, "parsed", len(parsed), "inserted", inserted, "drafted", drafted)

	case strings.Contains(url, "get_group"):
		space, err := parser.ParseGetGroupResponse(respText)
		if err != nil {
			slog.Warn("ingest parse get_group", "err", err, "url", url)
			return err
		}
		if space != nil && space.SpaceKey != "" && space.SpaceName != "" {
			if err := p.db.UpsertSpaceName(ctx, p.userID, space.SpaceKey, space.SpaceName); err != nil {
				return err
			}
			if p.hub != nil {
				p.hub.SpacesChanged()
			}
		}

	case strings.Contains(url, "batchexecute") && strings.Contains(url, "SBNmJb"):
		p.ingestBatchExecuteSenderSearch(ctx, url, respText)
		if p.hub != nil {
			p.hub.InboxChanged()
		}

	case strings.Contains(url, "get_user_settings"):
		if id, _ := parser.ParseGetUserSettings(respText); id != "" {
			prev, _, _, _ := p.db.LookupSelfIdentity(ctx, p.userID)
			if err := p.db.SetChatUserID(ctx, p.userID, id); err != nil {
				slog.Warn("set chat user id", "err", err)
			}
			// First time we've learned self identity — if the startup
			// sender-search couldn't fire (no ldap), kick it now.
			if prev == "" && senderSearchCount == 0 {
				p.requestInitialSenderSearch(ctx)
			}
		}

	case strings.Contains(url, "list_members"):
		profiles, err := parser.ParseListMembersProfiles(respText)
		if err != nil {
			slog.Warn("ingest parse list_members", "err", err, "url", url)
			return err
		}
		for _, prof := range profiles {
			if prof.ID == "" {
				continue
			}
			if err := p.db.UpsertChatMember(ctx, p.userID, prof.ID, prof.DisplayName, prof.Email); err != nil {
				slog.Warn("upsert chat member push", "err", err, "member", prof.ID)
			}
		}
		if len(profiles) > 0 {
			slog.Info("ingest push list_members profiles", "count", len(profiles))
			if p.hub != nil {
				// sender names may have changed for existing messages
				p.hub.InboxChanged()
			}
			// Self's email only becomes discoverable once a list_members
			// response that includes the profile block has been parsed.
			// Kick sender-search now if it hadn't started yet.
			if senderSearchCount == 0 {
				p.requestInitialSenderSearch(ctx)
			}
		}
	}

	if p.hub != nil {
		if inserted > 0 {
			p.hub.InboxChanged()
		}
		if drafted > 0 {
			p.broadcastPending(ctx)
		}
	}
	return nil
}

// ingestWebchannelFrame handles one decoded BrowserChannel frame (see
// inject-main.js). New-message frames land here first; noop/heartbeat and
// other event types parse to zero messages and are silently dropped.
func (p *ChatProcessor) ingestWebchannelFrame(ctx context.Context, url string, payload json.RawMessage) error {
	var env struct {
		Frame json.RawMessage `json:"frame"`
	}
	if err := json.Unmarshal(payload, &env); err != nil {
		return err
	}
	parsed, err := parser.ParseWebchannelFrame(env.Frame)
	if err != nil {
		slog.Warn("parse webchannel frame", "err", err, "url", shortWebchannelURL(url), "bytes", len(env.Frame))
		return err
	}
	if len(parsed) == 0 {
		return nil
	}
	var inserted, drafted int
	for _, m := range parsed {
		mi, di := p.ingestMessage(ctx, m)
		inserted += mi
		drafted += di
	}
	slog.Info("webchannel push",
		"url", shortWebchannelURL(url),
		"parsed", len(parsed),
		"inserted", inserted,
		"drafted", drafted)
	if p.hub != nil {
		if inserted > 0 {
			p.hub.InboxChanged()
		}
		if drafted > 0 {
			p.broadcastPending(ctx)
		}
	}
	return nil
}

func shortWebchannelURL(u string) string {
	// strip query to keep logs readable
	if i := strings.Index(u, "?"); i > 0 {
		return u[:i]
	}
	return u
}

// requestSpaceNameRefresh asks any connected extensions to call get_group
// for every space we still have no real name for. The extension replays
// the response through the normal raw path; Ingest picks it up and updates
// messages.space_name. Safe to repeat — if the extension is offline the
// event is dropped; ws.go re-fires on every new WS connect so eventually
// at least one browser tab handles it.
func (p *ChatProcessor) requestSpaceNameRefresh(ctx context.Context) {
	if p.hub == nil {
		return
	}
	ids, err := p.db.ListSpacesMissingName(ctx, p.userID)
	if err != nil {
		slog.Warn("list spaces missing name", "err", err)
		return
	}
	if len(ids) == 0 {
		slog.Info("space name refresh: all spaces already named")
		return
	}
	slog.Info("space name refresh: requesting", "count", len(ids))
	p.hub.RefreshSpaces(ids)
}

// RequestSpaceNameRefresh is the public entry so non-worker code (e.g. the
// WS handler on new connect) can kick the same flow.
func (p *ChatProcessor) RequestSpaceNameRefresh(ctx context.Context) {
	p.mu.Lock()
	defer p.mu.Unlock()
	if err := p.ensureUser(ctx); err != nil {
		slog.Warn("refresh spaces: ensure user", "err", err)
		return
	}
	p.requestSpaceNameRefresh(ctx)
}

// extensionSenderSearchCap bounds the ongoing "keep paging backwards" sync
// started by requestInitialSenderSearch + continued on each SBNmJb ingest.
const extensionSenderSearchCap = 10000

// ldapFromEmail extracts the ldap login (first dot-separated segment of
// the email local part). "chunping.wang@ailabs.tw" → "chunping". Returns
// "" when there's nothing plausibly local.
func ldapFromEmail(email string) string {
	email = strings.TrimSpace(strings.ToLower(email))
	if email == "" || strings.HasPrefix(email, "local-extension-user@") {
		return ""
	}
	at := strings.IndexByte(email, '@')
	if at <= 0 {
		return ""
	}
	local := email[:at]
	if i := strings.IndexByte(local, '.'); i > 0 {
		return local[:i]
	}
	return local
}

// resolveSelfLdap picks the best source of the current user's ldap, in
// priority order:
//   1. users.chat_user_id → chat_members.email (fully auto-discovered)
//   2. users.email (set by OAuth or EnsureLocalUser from cfg)
//   3. LOCAL_USER_EMAIL env var (cached on p.userEmail at startup)
// Empty return means: don't know yet — caller should skip, and the
// get_user_settings ingest path will re-fire sender-search later.
func (p *ChatProcessor) resolveSelfLdap(ctx context.Context) string {
	if p.userID > 0 {
		email, _, _, err := p.db.LookupSelfIdentity(ctx, p.userID)
		if err == nil && email != "" {
			if l := ldapFromEmail(email); l != "" {
				return l
			}
		}
	}
	if u, err := p.db.GetUserByID(ctx, p.userID); err == nil && u != nil {
		if l := ldapFromEmail(u.Email); l != "" {
			return l
		}
	}
	return ldapFromEmail(p.userEmail)
}

// requestInitialSenderSearch kicks off the style-corpus pull by asking
// any connected extension to fire the first SBNmJb page. Each subsequent
// page is driven from ingestBatchExecuteSenderSearch once the previous
// response lands.
func (p *ChatProcessor) requestInitialSenderSearch(ctx context.Context) {
	if p.hub == nil {
		return
	}
	ldap := p.resolveSelfLdap(ctx)
	if ldap == "" {
		slog.Info("sender-search: ldap unknown yet (waiting for get_user_settings ingest)")
		return
	}
	slog.Info("sender-search: requesting first page", "ldap", ldap)
	before := time.Now().Add(24 * time.Hour).UnixMilli()
	p.hub.RequestSenderSearch(ldap, before, 97)
}

// senderSearchCount tracks how many SBNmJb results we've ingested this
// process lifetime. Guarded by p.mu.
var senderSearchCount int

// ingestBatchExecuteSenderSearch parses a batchexecute SBNmJb response
// forwarded through the XHR raw path and, if we're still below the cap
// and the page wasn't empty, asks the extension to fetch the next page.
func (p *ChatProcessor) ingestBatchExecuteSenderSearch(ctx context.Context, url, respText string) {
	page, err := parser.ParseBatchExecuteSBNmJb([]byte(respText))
	if err != nil {
		slog.Warn("sender-search: parse failed", "err", err, "bytes", len(respText))
		return
	}
	if page == nil || len(page.Messages) == 0 {
		slog.Info("sender-search: end of history", "fetched_total", senderSearchCount)
		return
	}

	inserted := 0
	for _, m := range page.Messages {
		if !isFresh(m.ObservedAt) {
			continue
		}
		spaceName := m.SpaceKey
		if known, _ := p.db.LookupSpaceName(ctx, p.userID, m.SpaceKey); known != "" {
			spaceName = known
		}
		msg := &store.Message{
			UserID:     p.userID,
			SpaceKey:   m.SpaceKey,
			SpaceName:  spaceName,
			MessageKey: m.MessageKey,
			SenderName: p.userName,
			SenderIsMe: true,
			Body:       m.Body,
			ObservedAt: m.ObservedAt,
		}
		newRow, err := p.db.InsertOrGetMessage(ctx, msg)
		if err != nil {
			slog.Warn("sender-search: insert", "err", err, "msg", m.MessageKey)
			continue
		}
		if newRow {
			inserted++
		}
		_ = p.db.MarkMessageAsMine(ctx, p.userID, m.MessageKey)
	}
	senderSearchCount += len(page.Messages)
	slog.Info("sender-search: page ingested",
		"fetched", len(page.Messages),
		"inserted", inserted,
		"total", senderSearchCount,
		"oldest", page.OldestObserved.Format(time.RFC3339),
	)

	if senderSearchCount >= extensionSenderSearchCap {
		slog.Info("sender-search: cap reached", "total", senderSearchCount)
		return
	}
	if page.OldestObserved.IsZero() {
		return
	}
	// If even the newest message on this page already fell off the
	// freshness window, the next (older) page can't possibly contain
	// anything we'd insert. Stop paginating.
	if !isFresh(page.NewestObserved) {
		slog.Info("sender-search: page older than freshness window, stopping",
			"newest", page.NewestObserved.Format(time.RFC3339))
		return
	}
	ldap := page.LdapFilter
	if ldap == "" {
		ldap = ldapFromEmail(p.userEmail)
	}
	if ldap == "" || p.hub == nil {
		return
	}
	p.hub.RequestSenderSearch(ldap, page.OldestObserved.UnixMilli()-1, 97)
}

// syncStyleCorpus paginates backwards through the user's own messages via
// /DynamiteWebUi/data/batchexecute?rpcids=SBNmJb until we've either pulled
// styleSyncMaxRecords rows or the API returns nothing / the same page
// twice. Rows land in the messages table with sender_is_me=true, which:
//   * enriches the style corpus downstream tooling reads from
//   * back-fills historical rows that predated the WasRecentlySentDraft
//     detection so we stop mistakenly drafting replies to ourselves
//
// Session is optional and session tokens expire regularly; failures here
// only log and never block startup.
const (
	styleSyncMaxRecords = 10000
	styleSyncPageSize   = 97
)

func (p *ChatProcessor) syncStyleCorpus(ctx context.Context, sessionPath string) {
	sess, err := googleapi.LoadSession(sessionPath)
	if err != nil {
		slog.Warn("stylesync: load session failed", "err", err, "path", sessionPath)
		return
	}
	if sess == nil {
		return
	}
	p.mu.Lock()
	if err := p.ensureUser(ctx); err != nil {
		p.mu.Unlock()
		slog.Warn("stylesync: ensure user", "err", err)
		return
	}
	userID := p.userID
	p.mu.Unlock()

	before := time.Now().Add(24 * time.Hour).UnixMilli()
	total := 0
	page := 0
	for total < styleSyncMaxRecords {
		page++
		body, err := sess.SearchOwnMessages(ctx, before, styleSyncPageSize)
		if err != nil {
			slog.Warn("stylesync: search failed", "err", err, "page", page)
			return
		}
		decoded, err := parser.ParseBatchExecuteSBNmJb(body)
		if err != nil {
			slog.Warn("stylesync: parse failed", "err", err, "page", page)
			return
		}
		if decoded == nil || len(decoded.Messages) == 0 {
			slog.Info("stylesync: no more results", "total_fetched", total, "pages", page-1)
			return
		}

		inserted := 0
		for _, m := range decoded.Messages {
			if m.MessageKey == "" || m.Body == "" {
				continue
			}
			if !isFresh(m.ObservedAt) {
				continue
			}
			spaceName := m.SpaceKey
			if known, _ := p.db.LookupSpaceName(ctx, userID, m.SpaceKey); known != "" {
				spaceName = known
			}
			msg := &store.Message{
				UserID:     userID,
				SpaceKey:   m.SpaceKey,
				SpaceName:  spaceName,
				MessageKey: m.MessageKey,
				SenderName: p.userName,
				SenderIsMe: true,
				Body:       m.Body,
				ObservedAt: m.ObservedAt,
			}
			newRow, err := p.db.InsertOrGetMessage(ctx, msg)
			if err != nil {
				slog.Warn("stylesync: insert", "err", err, "msg", m.MessageKey)
				continue
			}
			if newRow {
				inserted++
			}
			// Force sender_is_me=true on any existing row whose message_key
			// we've now confirmed is ours (catches historical rows mis-
			// flagged as sender_is_me=false).
			_ = p.db.MarkMessageAsMine(ctx, userID, m.MessageKey)
		}
		total += len(decoded.Messages)
		slog.Info("stylesync: page done",
			"page", page,
			"fetched", len(decoded.Messages),
			"inserted", inserted,
			"running_total", total,
			"oldest", decoded.OldestObserved.Format(time.RFC3339),
		)

		if decoded.OldestObserved.IsZero() {
			return
		}
		if !isFresh(decoded.NewestObserved) {
			slog.Info("stylesync: page older than freshness window, stopping",
				"newest", decoded.NewestObserved.Format(time.RFC3339))
			return
		}
		nextBefore := decoded.OldestObserved.UnixMilli()
		if nextBefore >= before {
			// No progress → break to avoid an infinite loop.
			slog.Info("stylesync: no forward progress, stopping", "total", total)
			return
		}
		before = nextBefore
	}
	slog.Info("stylesync: reached record cap", "total", total)
}

// broadcastPending pushes all currently-approved pending drafts to subscribed
// extensions. Safe to over-send: content.js dedupes by draft_id.
func (p *ChatProcessor) broadcastPending(ctx context.Context) {
	if p.hub == nil {
		return
	}
	pending, err := p.db.ListApprovedPending(ctx, p.userID, 20)
	if err != nil {
		slog.Warn("broadcast pending list", "err", err)
		return
	}
	for _, item := range pending {
		p.hub.Pending(item)
	}
}

// ingestMessage inserts/dedups a parsed message and creates a pending draft
// when it's both new and from someone other than the authed user.
// Returns (messagesInserted, draftsCreated) — 0 or 1 each.
func (p *ChatProcessor) ingestMessage(ctx context.Context, pm parser.ParsedMessage) (int, int) {
	if !isFresh(pm.ObservedAt) {
		return 0, 0
	}
	// Enrich pm with sender info from the directory if the caller left it
	// blank (happens for webchannel push frames which only carry sender_id).
	if pm.SenderName == "" || pm.SenderEmail == "" {
		if m, err := p.db.LookupChatMember(ctx, p.userID, pm.SenderID); err == nil && m != nil {
			if pm.SenderName == "" {
				pm.SenderName = m.DisplayName
			}
			if pm.SenderEmail == "" {
				pm.SenderEmail = m.Email
			}
		}
	}
	// Conversely, if this message itself carries name/email (list_topics
	// case), persist to the directory so later webchannel pushes for the
	// same sender can use it.
	if pm.SenderID != "" && (pm.SenderName != "" || pm.SenderEmail != "") {
		_ = p.db.UpsertChatMember(ctx, p.userID, pm.SenderID, pm.SenderName, pm.SenderEmail)
	}

	senderIsMe := strings.EqualFold(pm.SenderEmail, p.userEmail)
	if !senderIsMe && hasUsableLocalUserName(p.userName) {
		senderIsMe = strings.EqualFold(strings.TrimSpace(pm.SenderName), strings.TrimSpace(p.userName))
	}
	if !senderIsMe {
		recentlySent, err := p.db.WasRecentlySentDraft(ctx, p.userID, pm.SpaceKey, pm.Body, pm.ObservedAt)
		if err != nil {
			slog.Warn("match recently sent draft", "err", err, "msg_id", pm.MessageID)
		} else if recentlySent {
			senderIsMe = true
			if hasUsableDiscoveredSenderName(pm.SenderName) && !strings.EqualFold(strings.TrimSpace(pm.SenderName), strings.TrimSpace(p.userName)) {
				p.userName = strings.TrimSpace(pm.SenderName)
				if _, err := p.db.EnsureLocalUser(ctx, p.userEmail, p.userName); err != nil {
					slog.Warn("persist local user name", "err", err, "name", p.userName)
				}
			}
		}
	}

	// Prefer whatever name the directory already holds; only fall back
	// to the placeholder space_key when we truly haven't learned one.
	spaceName := pm.SpaceKey
	if known, _ := p.db.LookupSpaceName(ctx, p.userID, pm.SpaceKey); known != "" {
		spaceName = known
	}
	msg := &store.Message{
		UserID:     p.userID,
		SpaceKey:   pm.SpaceKey,
		SpaceName:  spaceName,
		ThreadKey:  pm.TopicID,
		MessageKey: pm.MessageID,
		SenderName: pm.SenderName,
		SenderIsMe: senderIsMe,
		Body:       pm.Body,
		ObservedAt: pm.ObservedAt,
	}
	insertedNow, err := p.db.InsertOrGetMessage(ctx, msg)
	if err != nil {
		slog.Warn("insert message", "err", err, "msg_id", pm.MessageID)
		return 0, 0
	}
	if !insertedNow || senderIsMe {
		if insertedNow {
			return 1, 0
		}
		return 0, 0
	}

	// Respect per-space opt-out: skip drafting but keep the message.
	if disabled, _ := p.db.IsSpaceDisabled(ctx, p.userID, pm.SpaceKey); disabled {
		return 1, 0
	}

	settings, err := p.db.GetUserSettings(ctx, p.userID)
	if err != nil {
		slog.Warn("get settings", "err", err)
		settings = &store.UserSettings{UserID: p.userID}
	}

	if settings.ReplyOnlyWhenMentioned && !mentionsUser(pm.Body, p.userName) {
		return 1, 0
	}

	draft := &store.Draft{
		MessageID: msg.ID,
		Body:      "[stub draft] 收到「" + truncate(pm.Body, 40) + "」",
		Model:     "stub",
		SendMode:  "new_topic",
		Status:    "pending",
		Reasoning: "Claude 未接上，之後會生成真實 draft",
	}
	if settings.AutoMode && !matchesBlockedKeyword(pm.Body, settings.BlockedKeywords) {
		draft.Status = "approved"
		draft.AutoSent = true
		draft.Reasoning = "auto-mode approved (stub)"
	}
	if err := p.db.InsertDraft(ctx, draft); err != nil {
		slog.Warn("insert draft", "err", err)
		return 1, 0
	}
	return 1, 1
}

func matchesBlockedKeyword(body, csv string) bool {
	body = strings.ToLower(body)
	for _, k := range strings.Split(csv, ",") {
		k = strings.TrimSpace(strings.ToLower(k))
		if k == "" {
			continue
		}
		if strings.Contains(body, k) {
			return true
		}
	}
	return false
}

func truncate(s string, n int) string {
	r := []rune(s)
	if len(r) <= n {
		return s
	}
	return string(r[:n]) + "…"
}

// mentionsUser returns true when body contains a literal "@<userName>"
// mention. Google Chat renders @-mentions as the raw display name in the
// message body (see DB samples), so a case-insensitive substring match is
// enough — no need to parse annotation structures.
//
// Empty user name → always false, which keeps drafting off when we don't
// know who "me" is (safer default for a reply-only-when-mentioned gate).
func mentionsUser(body, userName string) bool {
	userName = strings.TrimSpace(userName)
	if userName == "" {
		return false
	}
	return strings.Contains(strings.ToLower(body), "@"+strings.ToLower(userName))
}

func hasUsableLocalUserName(name string) bool {
	name = strings.TrimSpace(name)
	return name != "" && !strings.EqualFold(name, defaultLocalUserName)
}

func hasUsableDiscoveredSenderName(name string) bool {
	name = strings.TrimSpace(name)
	return name != "" && !strings.EqualFold(name, "google chat")
}
