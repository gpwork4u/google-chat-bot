// PendingBadge 使用範例
// 基於 Tailwind v4 + React（TypeScript）

interface PendingBadgeProps {
  count: number;
  "data-testid"?: string;
}

function PendingBadge({ count, "data-testid": testId = "space-facts-pending-badge" }: PendingBadgeProps) {
  if (count === 0) return null;

  const displayCount = count > 99 ? "99+" : String(count);

  return (
    <span
      data-testid={testId}
      aria-label={`${count} 筆待審核 candidate`}
      className={[
        "inline-flex items-center justify-center",
        "min-w-[20px] h-5 px-1.5",
        "text-xs font-semibold text-[--color-text-inverse]",
        "bg-[--color-primary-500]",
        "rounded-[--radius-full]",
      ].join(" ")}
    >
      {displayCount}
    </span>
  );
}

// --- SettingsPage Space facts section 中使用 ---
<a
  href="/space-facts/candidates"
  className="flex items-center gap-2 text-sm text-[--color-text-link] hover:underline"
  aria-label="查看待審核 candidate facts"
>
  <span>待審核 candidate</span>
  <PendingBadge count={12} data-testid="space-facts-pending-badge" />
</a>

// --- 無待審核時不顯示 ---
<PendingBadge count={0} /> {/* renders null */}

// --- 超過 99 筆 ---
<PendingBadge count={150} /> {/* 顯示 "99+" */}
