// SpaceCard 使用範例
// 基於 Tailwind v4 + React（TypeScript）

import { ChevronRight } from "lucide-react";

interface SpaceCardProps {
  spaceKey: string;
  spaceName: string;
  approvedCount: number;
  candidateCount?: number;
  "data-testid"?: string;
}

function SpaceCard({
  spaceKey,
  spaceName,
  approvedCount,
  candidateCount = 0,
  "data-testid": testId = "space-facts-space-card",
}: SpaceCardProps) {
  const href = `/space-facts/${spaceKey}`;

  return (
    <article
      data-testid={testId}
      data-space-key={spaceKey}
    >
      <a
        href={href}
        aria-label={`${spaceName}，已核准 ${approvedCount} 筆 facts，查看詳情`}
        className={[
          "flex items-center justify-between",
          "px-4 py-3",
          "border border-[--color-border-default] rounded-[--radius-md]",
          "bg-[--color-surface-default]",
          "hover:border-[--color-border-strong] hover:bg-[--color-surface-subtle]",
          "focus:outline-none focus:ring-2 focus:ring-[--color-border-focus]",
          "transition-colors duration-[--duration-fast]",
          "block",
        ].join(" ")}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-[--color-text-default] truncate">
              {spaceName}
            </span>
            {candidateCount > 0 && (
              <PendingBadge count={candidateCount} />
            )}
          </div>
          <p className="text-xs text-[--color-text-muted] mt-0.5">
            已核准 {approvedCount} 筆 facts
          </p>
        </div>
        <ChevronRight
          size={16}
          className="text-[--color-text-muted] shrink-0 ml-2"
          aria-hidden="true"
        />
      </a>
    </article>
  );
}

// --- Skeleton ---
function SpaceCardSkeleton() {
  return (
    <article className="px-4 py-3 border border-[--color-border-default] rounded-[--radius-md] animate-pulse">
      <div className="flex items-center justify-between">
        <div className="h-4 bg-[--color-surface-muted] rounded w-32" />
        <div className="h-4 bg-[--color-surface-muted] rounded w-8" />
      </div>
      <div className="h-3 bg-[--color-surface-muted] rounded w-24 mt-1.5" />
    </article>
  );
}

// --- SettingsPage Space facts section 中使用 ---
<div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
  <SpaceCard
    spaceKey="abc-123"
    spaceName="Team #frontend"
    approvedCount={5}
    candidateCount={2}
    data-testid="space-facts-space-card"
  />
  <SpaceCard
    spaceKey="xyz-456"
    spaceName="Project Alpha"
    approvedCount={12}
    candidateCount={0}
    data-testid="space-facts-space-card"
  />
  {/* loading 時 */}
  <SpaceCardSkeleton />
</div>
