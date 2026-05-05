// SentRecordCard — 使用範例
// 基於 Tailwind v4 + Lucide React
// 參考 design/components/SentRecordCard/spec.md

import { ChevronDown, ChevronUp, CheckCircle, Zap, PenLine } from "lucide-react";
import { useState } from "react";

// ---- 型別定義 ----
interface SentRecord {
  id: string;
  space_id: string;
  space_name: string;
  sender_id: string;
  sender_name: string;
  trigger_message: string;
  sent_content: string;
  mode: "approved" | "auto";
  edited_by_user: boolean;
  category: "daily-chat" | "work-coordination" | "engineering" | "skip";
  sent_at: string;  // ISO 8601
  // 展開詳情時的上下文（由 API 提供或從卡片資料衍生）
  context_messages?: Array<{
    sender_name: string;
    content: string;
  }>;
}

// ---- 輔助：relative time ----
function relativeTime(isoStr: string): string {
  const diff = Date.now() - new Date(isoStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "剛剛";
  if (minutes < 60) return `${minutes} 分鐘前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小時前`;
  return `${Math.floor(hours / 24)} 天前`;
}

// ---- 元件 ----
interface SentRecordCardProps {
  record: SentRecord;
  defaultExpanded?: boolean;
  onExpand?: (id: string, expanded: boolean) => void;
}

export function SentRecordCard({
  record,
  defaultExpanded = false,
  onExpand,
}: SentRecordCardProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  const handleToggle = () => {
    const next = !isExpanded;
    setIsExpanded(next);
    onExpand?.(record.id, next);
  };

  const modeText = record.mode === "approved" ? "已審核" : "自動";
  const detailId = `${record.id}-detail`;

  return (
    <article
      role="article"
      aria-label={`${record.space_name} 的送出記錄，來自 ${record.sender_name}`}
      className={[
        "relative rounded-md border border-[--color-border-default]",
        "bg-[--color-surface-default]",
        "shadow-[--shadow-card]",
        "hover:bg-[--color-surface-subtle]",
        "transition-colors duration-150",
        "px-4 py-3",
      ].join(" ")}
    >
      {/* ── 標題行 ─────────────────────────────────────── */}
      <div className="flex items-center gap-2">
        {/* Space 名稱 */}
        <span className="flex-1 text-sm font-semibold text-[--color-text-default] truncate min-w-0">
          {record.space_name}
        </span>

        {/* Badges */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {/* Mode Badge */}
          <span
            aria-label={`送出方式：${modeText}`}
            className={
              record.mode === "approved"
                ? [
                    "inline-flex items-center gap-1 px-1.5 py-0.5",
                    "text-xs font-medium rounded-[--radius-xs]",
                    "bg-[--color-mode-approved-bg] text-[--color-mode-approved-text]",
                    "border border-[--color-mode-approved-border]",
                  ].join(" ")
                : [
                    "inline-flex items-center gap-1 px-1.5 py-0.5",
                    "text-xs font-medium rounded-[--radius-xs]",
                    "bg-[--color-mode-auto-bg] text-[--color-mode-auto-text]",
                    "border border-[--color-mode-auto-border]",
                  ].join(" ")
            }
          >
            {record.mode === "approved" ? (
              <CheckCircle size={10} aria-hidden="true" />
            ) : (
              <Zap size={10} aria-hidden="true" />
            )}
            {modeText}
          </span>

          {/* Edited Badge（有條件顯示） */}
          {record.edited_by_user && (
            <span
              aria-label="使用者曾編輯此草稿"
              className={[
                "inline-flex items-center gap-1 px-1.5 py-0.5",
                "text-xs rounded-[--radius-xs]",
                "bg-[--color-surface-muted] text-[--color-text-muted]",
                "border border-[--color-border-default]",
              ].join(" ")}
            >
              <PenLine size={10} aria-hidden="true" />
              使用者編輯過
            </span>
          )}
        </div>

        {/* 展開/收合 Toggle */}
        <button
          type="button"
          onClick={handleToggle}
          aria-expanded={isExpanded}
          aria-controls={detailId}
          aria-label={isExpanded ? "收合詳情" : "展開詳情"}
          className={[
            "flex-shrink-0 flex items-center justify-center",
            "w-7 h-7",
            "min-w-[44px] min-h-[44px] -m-2",
            "rounded-sm",
            "text-[--color-text-muted]",
            "hover:bg-[--color-surface-muted]",
            "transition-colors duration-150",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-[--color-border-focus]",
          ].join(" ")}
        >
          {isExpanded ? (
            <ChevronUp size={14} aria-hidden="true" />
          ) : (
            <ChevronDown size={14} aria-hidden="true" />
          )}
        </button>
      </div>

      {/* ── Meta 行 ─────────────────────────────────────── */}
      <div className="flex items-center mt-0.5">
        <span className="text-xs text-[--color-text-muted]">{record.sender_name}</span>
        <span className="text-xs text-[--color-text-muted] mx-1" aria-hidden="true">·</span>
        <time
          dateTime={record.sent_at}
          title={new Date(record.sent_at).toLocaleString("zh-TW")}
          className="text-xs text-[--color-text-muted]"
        >
          {relativeTime(record.sent_at)}
        </time>
      </div>

      {/* ── 分隔線 ───────────────────────────────────────── */}
      <div className="border-t border-[--color-border-default] my-2" aria-hidden="true" />

      {/* ── 觸發訊息 ─────────────────────────────────────── */}
      <div className="flex items-baseline gap-1.5">
        <span className="text-xs text-[--color-text-placeholder] flex-shrink-0">觸發：</span>
        <span className="text-xs text-[--color-text-muted] truncate min-w-0">
          {record.trigger_message}
        </span>
      </div>

      {/* ── 送出內容 ─────────────────────────────────────── */}
      <div className="flex items-baseline gap-1.5 mt-1">
        <span className="text-xs font-medium text-[--color-text-secondary] flex-shrink-0">
          送出：
        </span>
        <span
          className={[
            "text-sm text-[--color-text-default]",
            isExpanded ? "" : "line-clamp-2",
          ].join(" ")}
        >
          {record.sent_content}
        </span>
      </div>

      {/* ── 展開詳情（上下文） ──────────────────────────── */}
      <div
        id={detailId}
        role="region"
        aria-label="詳情"
        className={[
          "overflow-hidden",
          "motion-safe:transition-[max-height] duration-200 ease-out",
          isExpanded ? "max-h-[200px]" : "max-h-0",
        ].join(" ")}
      >
        {record.context_messages && record.context_messages.length > 0 && (
          <div className="bg-[--color-surface-muted] rounded-sm px-3 py-2 mt-2 max-h-[200px] overflow-y-auto">
            <p className="text-xs font-medium text-[--color-text-secondary] mb-1.5">上下文</p>
            <div className="space-y-1">
              {record.context_messages.map((msg, i) => (
                <div key={i} className="text-xs text-[--color-text-muted]">
                  <span className="font-medium text-[--color-text-secondary]">
                    {msg.sender_name}：
                  </span>
                  {msg.content}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </article>
  );
}

// ---- 使用示範 ----

// Approved，使用者有編輯過，展開上下文
<SentRecordCard
  record={{
    id: "rec-001",
    space_id: "AAAA",
    space_name: "Team #frontend",
    sender_id: "users/123",
    sender_name: "Alice",
    trigger_message: "你好嗎",
    sent_content: "還行，謝謝你的關心！",
    mode: "approved",
    edited_by_user: true,
    category: "daily-chat",
    sent_at: "2026-05-04T10:00:00Z",
    context_messages: [
      { sender_name: "Alice", content: "嘿，最近怎樣？" },
      { sender_name: "Alice", content: "你好嗎" },
    ],
  }}
  defaultExpanded={false}
  onExpand={(id, expanded) => console.log(id, expanded)}
/>

// Auto 模式，未編輯
<SentRecordCard
  record={{
    id: "rec-002",
    space_id: "BBBB",
    space_name: "Project Alpha",
    sender_id: "users/456",
    sender_name: "Bob",
    trigger_message: "會議幾點？",
    sent_content: "下午兩點，Google Meet。",
    mode: "auto",
    edited_by_user: false,
    category: "work-coordination",
    sent_at: "2026-05-04T08:30:00Z",
  }}
/>
