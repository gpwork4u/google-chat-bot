// FilterBar — 使用範例
// 基於 Tailwind v4 + Lucide React
// 參考 design/components/FilterBar/spec.md

import { Search, X, SlidersHorizontal, ChevronDown } from "lucide-react";
import { useState, useEffect, useRef } from "react";

interface SpaceOption {
  space_id: string;
  space_name: string;
}

interface FilterBarProps {
  mode: "all" | "approved" | "auto";
  selectedSpaces: SpaceOption[];
  availableSpaces: SpaceOption[];
  dateFrom: string | null;
  dateTo: string | null;
  searchQuery: string;
  onModeChange: (mode: string) => void;
  onSpacesChange: (spaces: SpaceOption[]) => void;
  onDateChange: (from: string | null, to: string | null) => void;
  onSearchChange: (q: string) => void;
  onReset: () => void;
}

// 計算活躍篩選數量
function countActiveFilters(
  mode: string,
  selectedSpaces: SpaceOption[],
  dateFrom: string | null,
  dateTo: string | null,
  searchQuery: string,
  defaultFrom: string,
  defaultTo: string
): number {
  let count = 0;
  if (mode !== "all") count++;
  if (selectedSpaces.length > 0) count++;
  if (dateFrom !== defaultFrom || dateTo !== defaultTo) count++;
  if (searchQuery !== "") count++;
  return count;
}

export function FilterBar({
  mode,
  selectedSpaces,
  availableSpaces,
  dateFrom,
  dateTo,
  searchQuery,
  onModeChange,
  onSpacesChange,
  onDateChange,
  onSearchChange,
  onReset,
}: FilterBarProps) {
  const [localSearch, setLocalSearch] = useState(searchQuery);
  const [showSpaceDropdown, setShowSpaceDropdown] = useState(false);
  const [showMobileDrawer, setShowMobileDrawer] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 預設日期：今天和 7 天前
  const today = new Date().toISOString().split("T")[0];
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0];

  // debounce 搜尋
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onSearchChange(localSearch);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [localSearch]);

  const activeCount = countActiveFilters(
    mode, selectedSpaces, dateFrom, dateTo, searchQuery, sevenDaysAgo, today
  );

  const handleRemoveSpace = (space_id: string) => {
    onSpacesChange(selectedSpaces.filter((s) => s.space_id !== space_id));
  };

  const handleToggleSpace = (space: SpaceOption) => {
    const isSelected = selectedSpaces.some((s) => s.space_id === space.space_id);
    if (isSelected) {
      onSpacesChange(selectedSpaces.filter((s) => s.space_id !== space.space_id));
    } else {
      onSpacesChange([...selectedSpaces, space]);
    }
  };

  const dateInvalid = !!(dateFrom && dateTo && dateFrom > dateTo);

  return (
    <>
      {/* ── 桌面版 FilterBar ──────────────────────────────── */}
      <div
        role="search"
        aria-label="篩選記錄"
        className={[
          "hidden md:flex flex-wrap items-center gap-2",
          "px-4 py-2",
          "bg-[--color-surface-default]",
          "border-b border-[--color-border-default]",
          "sticky top-0 z-[--z-sticky]",
        ].join(" ")}
      >
        {/* Mode Select */}
        <div className="relative">
          <label htmlFor="filter-mode" className="sr-only">
            送出方式篩選
          </label>
          <select
            id="filter-mode"
            value={mode}
            onChange={(e) => onModeChange(e.target.value)}
            className={[
              "h-8 pl-2.5 pr-7",
              "text-sm text-[--color-text-default]",
              "bg-[--color-surface-default]",
              "border border-[--color-border-default] rounded-sm",
              "appearance-none cursor-pointer",
              "focus:outline-none focus:border-[--color-border-focus]",
              "focus:ring-1 focus:ring-[--color-border-focus]",
            ].join(" ")}
          >
            <option value="all">全部</option>
            <option value="approved">已審核</option>
            <option value="auto">自動</option>
          </select>
          <ChevronDown
            size={12}
            aria-hidden="true"
            className="absolute right-2 top-1/2 -translate-y-1/2 text-[--color-text-muted] pointer-events-none"
          />
        </div>

        {/* Space 多選 */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* 已選 space chips */}
          {selectedSpaces.map((space) => (
            <span
              key={space.space_id}
              className={[
                "inline-flex items-center gap-1 h-6 pl-2 pr-1",
                "text-xs text-[--color-text-secondary]",
                "bg-[--color-surface-muted]",
                "border border-[--color-border-default] rounded-[--radius-full]",
              ].join(" ")}
            >
              {space.space_name}
              <button
                type="button"
                onClick={() => handleRemoveSpace(space.space_id)}
                aria-label={`移除 ${space.space_name} 篩選`}
                className={[
                  "flex items-center justify-center",
                  "w-4 h-4 rounded-full",
                  "text-[--color-text-muted] hover:text-[--color-text-default]",
                  "hover:bg-[--color-neutral-300]",
                  "transition-colors duration-150",
                  "focus:outline-none focus-visible:ring-1 focus-visible:ring-[--color-border-focus]",
                ].join(" ")}
              >
                <X size={10} aria-hidden="true" />
              </button>
            </span>
          ))}

          {/* + 空間 按鈕 */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowSpaceDropdown(!showSpaceDropdown)}
              aria-expanded={showSpaceDropdown}
              aria-haspopup="listbox"
              aria-label="選擇空間篩選"
              className={[
                "inline-flex items-center gap-1 h-6 px-2",
                "text-xs text-[--color-text-secondary]",
                "border border-dashed border-[--color-border-default] rounded-[--radius-full]",
                "hover:bg-[--color-surface-muted]",
                "transition-colors duration-150",
                "focus:outline-none focus-visible:ring-1 focus-visible:ring-[--color-border-focus]",
              ].join(" ")}
            >
              + 空間
            </button>

            {/* Space Dropdown */}
            {showSpaceDropdown && (
              <div
                role="listbox"
                aria-multiselectable="true"
                aria-label="選擇空間"
                className={[
                  "absolute top-full left-0 mt-1 w-48",
                  "bg-[--color-surface-default]",
                  "border border-[--color-border-default] rounded-md",
                  "shadow-[--shadow-elevated]",
                  "z-[--z-dropdown]",
                  "max-h-48 overflow-y-auto",
                  "py-1",
                ].join(" ")}
              >
                {availableSpaces.map((space) => {
                  const isSelected = selectedSpaces.some((s) => s.space_id === space.space_id);
                  return (
                    <button
                      key={space.space_id}
                      role="option"
                      aria-selected={isSelected}
                      type="button"
                      onClick={() => handleToggleSpace(space)}
                      className={[
                        "w-full text-left px-3 py-1.5",
                        "text-sm",
                        isSelected
                          ? "text-[--color-primary-600] bg-[--color-primary-50]"
                          : "text-[--color-text-default] hover:bg-[--color-surface-subtle]",
                        "flex items-center gap-2",
                        "transition-colors duration-100",
                        "focus:outline-none focus-visible:bg-[--color-surface-muted]",
                      ].join(" ")}
                    >
                      {/* checkbox 視覺 */}
                      <span
                        aria-hidden="true"
                        className={[
                          "inline-flex items-center justify-center w-3.5 h-3.5 flex-shrink-0",
                          "border rounded-[--radius-xs]",
                          isSelected
                            ? "bg-[--color-primary-600] border-[--color-primary-600]"
                            : "border-[--color-border-strong]",
                        ].join(" ")}
                      >
                        {isSelected && <X size={8} color="white" />}
                      </span>
                      <span className="truncate">{space.space_name}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* 日期區間 */}
        <div className="flex items-center gap-1.5">
          <label htmlFor="filter-date-from" className="sr-only">
            起始日期
          </label>
          <input
            id="filter-date-from"
            type="date"
            value={dateFrom ?? sevenDaysAgo}
            onChange={(e) => onDateChange(e.target.value, dateTo)}
            className={[
              "h-8 px-2",
              "text-xs text-[--color-text-default]",
              "bg-[--color-surface-default]",
              "border rounded-sm",
              dateInvalid ? "border-[--color-error-default]" : "border-[--color-border-default]",
              "focus:outline-none focus:border-[--color-border-focus]",
              "focus:ring-1 focus:ring-[--color-border-focus]",
            ].join(" ")}
          />
          <span className="text-xs text-[--color-text-muted]" aria-hidden="true">–</span>
          <label htmlFor="filter-date-to" className="sr-only">
            結束日期
          </label>
          <input
            id="filter-date-to"
            type="date"
            value={dateTo ?? today}
            onChange={(e) => onDateChange(dateFrom, e.target.value)}
            aria-invalid={dateInvalid}
            aria-describedby={dateInvalid ? "date-error" : undefined}
            className={[
              "h-8 px-2",
              "text-xs text-[--color-text-default]",
              "bg-[--color-surface-default]",
              "border rounded-sm",
              dateInvalid ? "border-[--color-error-default]" : "border-[--color-border-default]",
              "focus:outline-none focus:border-[--color-border-focus]",
              "focus:ring-1 focus:ring-[--color-border-focus]",
            ].join(" ")}
          />
          {dateInvalid && (
            <span id="date-error" className="sr-only" role="alert">
              結束日期必須晚於起始日期
            </span>
          )}
        </div>

        {/* 搜尋欄 */}
        <div className="relative">
          <label htmlFor="sent-search" className="sr-only">
            搜尋送出內容
          </label>
          <Search
            size={14}
            aria-hidden="true"
            className="absolute left-2 top-1/2 -translate-y-1/2 text-[--color-text-placeholder]"
          />
          <input
            id="sent-search"
            type="search"
            value={localSearch}
            onChange={(e) => setLocalSearch(e.target.value)}
            placeholder="搜尋送出內容…"
            className={[
              "h-8 pl-7 pr-7",
              "text-sm text-[--color-text-default] placeholder:text-[--color-text-placeholder]",
              "bg-[--color-surface-default]",
              "border border-[--color-border-default] rounded-sm",
              "w-48 min-w-[160px]",
              "focus:outline-none focus:border-[--color-border-focus]",
              "focus:ring-1 focus:ring-[--color-border-focus]",
            ].join(" ")}
          />
          {localSearch && (
            <button
              type="button"
              onClick={() => { setLocalSearch(""); onSearchChange(""); }}
              aria-label="清除搜尋"
              className={[
                "absolute right-1.5 top-1/2 -translate-y-1/2",
                "flex items-center justify-center w-5 h-5",
                "text-[--color-text-muted] hover:text-[--color-text-default]",
                "rounded-full hover:bg-[--color-surface-muted]",
                "transition-colors duration-150",
                "focus:outline-none focus-visible:ring-1 focus-visible:ring-[--color-border-focus]",
              ].join(" ")}
            >
              <X size={10} aria-hidden="true" />
            </button>
          )}
        </div>

        {/* 重置按鈕（有活躍篩選才顯示） */}
        {activeCount > 0 && (
          <button
            type="button"
            onClick={onReset}
            className={[
              "h-8 px-2.5",
              "text-xs text-[--color-text-secondary]",
              "hover:bg-[--color-surface-muted]",
              "rounded-sm",
              "transition-colors duration-150",
              "focus:outline-none focus-visible:ring-1 focus-visible:ring-[--color-border-focus]",
            ].join(" ")}
          >
            重置
          </button>
        )}
      </div>

      {/* ── Mobile 版：單行篩選按鈕 ──────────────────────── */}
      <div
        className={[
          "md:hidden flex items-center gap-2 px-4 py-2",
          "bg-[--color-surface-default]",
          "border-b border-[--color-border-default]",
          "sticky top-0 z-[--z-sticky]",
        ].join(" ")}
      >
        <button
          type="button"
          onClick={() => setShowMobileDrawer(true)}
          aria-label={`篩選記錄${activeCount > 0 ? `，已啟用 ${activeCount} 個篩選` : ""}`}
          className={[
            "flex items-center gap-1.5 h-8 px-3",
            "text-sm text-[--color-text-secondary]",
            "bg-[--color-surface-default]",
            "border border-[--color-border-default] rounded-sm",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-[--color-border-focus]",
          ].join(" ")}
        >
          <SlidersHorizontal size={14} aria-hidden="true" />
          篩選
          {activeCount > 0 && (
            <span
              aria-hidden="true"
              className={[
                "inline-flex items-center justify-center",
                "min-w-[18px] h-[18px] px-1",
                "text-xs font-medium",
                "bg-[--color-primary-600] text-[--color-text-inverse]",
                "rounded-full",
              ].join(" ")}
            >
              {activeCount}
            </span>
          )}
        </button>

        {/* 搜尋欄（mobile 版常駐） */}
        <div className="relative flex-1">
          <label htmlFor="sent-search-mobile" className="sr-only">
            搜尋送出內容
          </label>
          <Search
            size={14}
            aria-hidden="true"
            className="absolute left-2 top-1/2 -translate-y-1/2 text-[--color-text-placeholder]"
          />
          <input
            id="sent-search-mobile"
            type="search"
            value={localSearch}
            onChange={(e) => setLocalSearch(e.target.value)}
            placeholder="搜尋…"
            className={[
              "w-full h-8 pl-7 pr-2",
              "text-sm text-[--color-text-default] placeholder:text-[--color-text-placeholder]",
              "bg-[--color-surface-default]",
              "border border-[--color-border-default] rounded-sm",
              "focus:outline-none focus:border-[--color-border-focus]",
              "focus:ring-1 focus:ring-[--color-border-focus]",
            ].join(" ")}
          />
        </div>
      </div>

      {/* ── Mobile Drawer ─────────────────────────────────── */}
      {showMobileDrawer && (
        <>
          {/* 背板 */}
          <div
            className="md:hidden fixed inset-0 bg-[--color-surface-overlay] z-[--z-overlay]"
            onClick={() => setShowMobileDrawer(false)}
            aria-hidden="true"
          />
          {/* Drawer */}
          <div
            role="dialog"
            aria-modal="true"
            aria-label="篩選設定"
            className={[
              "md:hidden fixed bottom-0 left-0 right-0",
              "bg-[--color-surface-default]",
              "border-t border-[--color-border-default]",
              "rounded-t-xl",
              "z-[--z-modal]",
              "px-4 pt-4 pb-8",
              "max-h-[80vh] overflow-y-auto",
            ].join(" ")}
          >
            {/* Drawer 頂部 */}
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-[--color-text-default]">篩選記錄</h2>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => { onReset(); setShowMobileDrawer(false); }}
                  className="text-xs text-[--color-text-secondary] hover:text-[--color-text-default]"
                >
                  重置
                </button>
                <button
                  type="button"
                  onClick={() => setShowMobileDrawer(false)}
                  className={[
                    "text-sm font-medium text-[--color-primary-600]",
                    "focus:outline-none focus-visible:ring-1 focus-visible:ring-[--color-border-focus]",
                  ].join(" ")}
                >
                  完成
                </button>
              </div>
            </div>

            {/* Mode（mobile） */}
            <div className="mb-4">
              <label
                htmlFor="filter-mode-mobile"
                className="block text-xs font-medium text-[--color-text-secondary] mb-1.5"
              >
                送出方式
              </label>
              <select
                id="filter-mode-mobile"
                value={mode}
                onChange={(e) => onModeChange(e.target.value)}
                className={[
                  "w-full h-10 px-3",
                  "text-sm text-[--color-text-default]",
                  "bg-[--color-surface-default]",
                  "border border-[--color-border-default] rounded-sm",
                  "focus:outline-none focus:border-[--color-border-focus]",
                ].join(" ")}
              >
                <option value="all">全部</option>
                <option value="approved">已審核</option>
                <option value="auto">自動</option>
              </select>
            </div>

            {/* 日期（mobile） */}
            <div className="mb-4">
              <p className="text-xs font-medium text-[--color-text-secondary] mb-1.5">日期區間</p>
              <div className="flex gap-2">
                <label htmlFor="filter-date-from-mobile" className="sr-only">起始日期</label>
                <input
                  id="filter-date-from-mobile"
                  type="date"
                  value={dateFrom ?? sevenDaysAgo}
                  onChange={(e) => onDateChange(e.target.value, dateTo)}
                  className="flex-1 h-10 px-3 text-sm border border-[--color-border-default] rounded-sm focus:outline-none focus:border-[--color-border-focus]"
                />
                <label htmlFor="filter-date-to-mobile" className="sr-only">結束日期</label>
                <input
                  id="filter-date-to-mobile"
                  type="date"
                  value={dateTo ?? today}
                  onChange={(e) => onDateChange(dateFrom, e.target.value)}
                  className="flex-1 h-10 px-3 text-sm border border-[--color-border-default] rounded-sm focus:outline-none focus:border-[--color-border-focus]"
                />
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}

// ---- 使用示範 ----

// 基本用法
<FilterBar
  mode="all"
  selectedSpaces={[]}
  availableSpaces={[
    { space_id: "AAAA", space_name: "Team #frontend" },
    { space_id: "BBBB", space_name: "Project Alpha" },
  ]}
  dateFrom={null}
  dateTo={null}
  searchQuery=""
  onModeChange={(m) => console.log("mode:", m)}
  onSpacesChange={(s) => console.log("spaces:", s)}
  onDateChange={(from, to) => console.log("date:", from, to)}
  onSearchChange={(q) => console.log("search:", q)}
  onReset={() => console.log("reset")}
/>
