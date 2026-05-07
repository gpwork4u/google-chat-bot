// cmd/backfill-skip — 一次性工具，把現存 pending 訊息中符合 D 類規則的批次標記 skipped。
//
// 用法：
//
//	backfill-skip                    # dry-run（預設），只列出「將會 skip」的訊息
//	backfill-skip --apply            # 真的呼叫 POST /api/claude/skip
//	backfill-skip --apply --max=200  # 最多處理 200 筆
//
// 安全閘：只處理 created_at < NOW() - cooldown_minutes 的訊息（預設 10 分鐘）。
// 這樣可確保剛進來、尚未被 skill 處理的訊息不會被搶先 skip。
package main

import (
	"context"
	"flag"
	"fmt"
	"os"
	"time"
)

func main() {
	// ── flags ──────────────────────────────────────────────────────────────
	apply := flag.Bool("apply", false, "實際呼叫 POST /api/claude/skip（預設 dry-run）")
	maxN := flag.Int("max", 0, "最多處理幾筆（0 = 不限）")
	apiBase := flag.String("api", "http://localhost:8080", "backend base URL")
	cooldown := flag.Int("cooldown-minutes", 10, "只處理 created_at < NOW()-N 分鐘的訊息")
	flag.Parse()

	// 全程最長 5 分鐘
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()

	cutoff := time.Now().Add(-time.Duration(*cooldown) * time.Minute)

	// ── 1. 取得候選訊息（透過 /api/claude/pending）───────────────────────
	candidates, err := fetchPending(ctx, *apiBase, *maxN)
	if err != nil {
		fmt.Fprintf(os.Stderr, "fatal: 無法取得 pending list: %v\n", err)
		os.Exit(2)
	}

	// ── 2. 過濾：cooldown 安全閘 ─────────────────────────────────────────
	var active []PendingMessage
	for _, m := range candidates {
		if m.CreatedAt.Before(cutoff) {
			active = append(active, m)
		}
	}

	fmt.Printf("scanned=%d\n", len(candidates))
	if len(candidates) > len(active) {
		fmt.Printf("skipped_by_cooldown=%d（created_at 在 %d 分鐘內，不處理）\n",
			len(candidates)-len(active), *cooldown)
	}

	// ── 3. 分類 + dry-run / apply ─────────────────────────────────────────
	var wouldSkip, skipped, errors int

	for i, m := range active {
		if *maxN > 0 && i >= *maxN {
			break
		}

		reason, ok := classify(m)
		if !ok {
			// 不屬於 D 類，保守略過
			continue
		}

		if !*apply {
			// dry-run：只印出將會 skip 的訊息
			fmt.Printf("would skip: %d reason=%s body=%q\n", m.MessageID, reason, truncate(m.Body, 60))
			wouldSkip++
			continue
		}

		// apply 模式：呼叫 backend endpoint
		if err := postSkip(ctx, *apiBase, m.MessageID, reason); err != nil {
			fmt.Printf("error: %d %v\n", m.MessageID, err)
			errors++
		} else {
			fmt.Printf("skipped: %d reason=%s\n", m.MessageID, reason)
			skipped++
		}
	}

	// ── 4. 摘要 ───────────────────────────────────────────────────────────
	if !*apply {
		fmt.Printf("would_skip=%d\n", wouldSkip)
	} else {
		fmt.Printf("skipped=%d errors=%d\n", skipped, errors)
		if errors > 0 {
			os.Exit(1)
		}
	}
}

// truncate 截斷字串到最大長度，超出時附 "..."。
func truncate(s string, max int) string {
	runes := []rune(s)
	if len(runes) <= max {
		return s
	}
	return string(runes[:max]) + "..."
}
