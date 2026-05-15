// SourceMessageList 使用範例
// 基於 Tailwind v4 + React（TypeScript）

import { useState } from "react";
import { ChevronRight, ChevronDown } from "lucide-react";

interface SourceMessage {
  id: number;
  sender_name: string;
  observed_at: string; // ISO 8601
  body: string;
}

interface SourceMessageListProps {
  factId: string;
  sourceMessageIds: number[];
  "data-testid-toggle"?: string;
  "data-testid-list"?: string;
}

function SourceMessageList({
  factId,
  sourceMessageIds,
  "data-testid-toggle": toggleTestId = "candidate-fact-source-toggle",
  "data-testid-list": listTestId = "candidate-fact-source-list",
}: SourceMessageListProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<SourceMessage[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);
  const listId = `source-list-${factId}`;

  if (sourceMessageIds.length === 0) {
    return (
      <span className="text-xs text-[--color-text-muted]">無來源訊息</span>
    );
  }

  const handleToggle = async () => {
    const nextOpen = !isOpen;
    setIsOpen(nextOpen);

    // 只在第一次展開時發 API
    if (nextOpen && messages === null && !isLoading) {
      setIsLoading(true);
      setHasError(false);
      try {
        const ids = sourceMessageIds.join(",");
        const res = await fetch(`/api/messages?id_in=${ids}`);
        if (!res.ok) throw new Error("fetch failed");
        const data = await res.json();
        setMessages(data.messages as SourceMessage[]);
      } catch {
        setHasError(true);
      } finally {
        setIsLoading(false);
      }
    }
  };

  // 相對時間格式（簡易版，實際可用 date-fns/dayjs）
  const formatTime = (iso: string) =>
    new Date(iso).toLocaleString("zh-TW", {
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <div>
      {/* Toggle button */}
      <button
        type="button"
        data-testid={toggleTestId}
        onClick={handleToggle}
        aria-expanded={isOpen}
        aria-controls={listId}
        aria-label="展開來源訊息"
        className={[
          "inline-flex items-center gap-1",
          "text-xs text-[--color-text-muted]",
          "hover:text-[--color-text-secondary]",
          "min-h-[44px] py-2",
          "focus:outline-none focus:underline",
          "transition-colors duration-[--duration-fast]",
        ].join(" ")}
      >
        {isOpen ? (
          <ChevronDown size={12} aria-hidden="true" />
        ) : (
          <ChevronRight size={12} aria-hidden="true" />
        )}
        來源訊息（{sourceMessageIds.length} 則）
      </button>

      {/* 展開列表 */}
      {isOpen && (
        <div
          className={[
            "bg-[--color-surface-subtle] rounded-[--radius-sm] mt-1",
            "overflow-hidden",
            "transition-all duration-[--duration-normal] ease-[--ease-out]",
          ].join(" ")}
        >
          {isLoading && (
            <ul
              id={listId}
              data-testid={listTestId}
              aria-busy="true"
              className="max-h-[200px] overflow-y-auto divide-y divide-[--color-border-default]"
            >
              {[...Array(Math.min(sourceMessageIds.length, 3))].map((_, i) => (
                <li key={i} className="px-3 py-2 animate-pulse space-y-1">
                  <div className="h-3 bg-[--color-surface-muted] rounded w-24" />
                  <div className="h-3 bg-[--color-surface-muted] rounded w-full" />
                </li>
              ))}
            </ul>
          )}

          {hasError && (
            <ul id={listId} data-testid={listTestId} className="px-3 py-2">
              <li className="text-xs text-[--color-error-strong]">
                來源訊息載入失敗，請重試
              </li>
            </ul>
          )}

          {!isLoading && !hasError && messages !== null && (
            <ul
              id={listId}
              data-testid={listTestId}
              className="max-h-[200px] overflow-y-auto divide-y divide-[--color-border-default]"
            >
              {messages.map((msg) => (
                <li key={msg.id} className="px-3 py-2">
                  <div className="flex items-baseline gap-1">
                    <span className="text-xs font-medium text-[--color-text-default]">
                      {msg.sender_name}
                    </span>
                    <time
                      dateTime={msg.observed_at}
                      title={msg.observed_at}
                      className="text-xs text-[--color-text-muted]"
                    >
                      · {formatTime(msg.observed_at)}
                    </time>
                  </div>
                  <p className="text-xs text-[--color-text-secondary] mt-0.5 line-clamp-3">
                    {msg.body}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

// --- 使用範例（CandidateFactRow 中） ---
<SourceMessageList
  factId="fact-123"
  sourceMessageIds={[100, 101, 105]}
  data-testid-toggle="candidate-fact-source-toggle"
  data-testid-list="candidate-fact-source-list"
/>

// --- 無來源訊息的 fact ---
<SourceMessageList factId="fact-456" sourceMessageIds={[]} />
