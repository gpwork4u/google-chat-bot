export default function SkeletonCard() {
  return (
    <div className="rounded-md border border-[--color-border-default] px-4 py-3 animate-pulse bg-[--color-surface-default]">
      <div className="flex items-start justify-between mb-2">
        <div className="flex flex-col gap-1.5">
          <div className="h-3.5 w-32 bg-[--color-neutral-200] rounded" />
          <div className="h-2.5 w-20 bg-[--color-neutral-200] rounded" />
        </div>
        <div className="h-5 w-12 bg-[--color-neutral-200] rounded-xs" />
      </div>
      <div className="h-[72px] bg-[--color-neutral-200] rounded-sm mb-3" />
      <div className="flex gap-2">
        <div className="h-7 w-20 bg-[--color-neutral-200] rounded-sm" />
        <div className="h-7 w-24 bg-[--color-neutral-200] rounded-sm" />
        <div className="h-7 w-16 bg-[--color-neutral-200] rounded-sm" />
      </div>
    </div>
  )
}
