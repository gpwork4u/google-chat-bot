// PendingFilterBar — 使用範例

<div
  role="search"
  aria-label="篩選 Pending 訊息"
  className="flex flex-wrap items-center gap-2 px-4 py-2 bg-[--color-surface-default] border-b border-[--color-border-default] sticky top-[48px] z-[--z-sticky]"
>
  {/* Space 多選 */}
  <select
    data-testid="space-filter"
    multiple
    aria-label="空間篩選"
    value={selectedSpaces}
    onChange={(e) => {
      const selected = Array.from(e.target.selectedOptions, (o) => o.value);
      onSpacesChange(selected);
    }}
    className="h-8 px-2.5 text-sm text-[--color-text-default] bg-[--color-surface-default] border border-[--color-border-default] rounded-sm focus:outline-none focus:border-[--color-border-focus] focus:ring-1 focus:ring-[--color-border-focus] min-w-[120px]"
  >
    {availableSpaces.map((s) => (
      <option key={s.space_key} value={s.space_key}>
        {s.space_name}
      </option>
    ))}
  </select>

  {/* Sender 篩選 */}
  <label htmlFor="sender-filter" className="sr-only">依發話人篩選</label>
  <input
    id="sender-filter"
    type="search"
    data-testid="sender-filter"
    placeholder="發話人..."
    aria-label="依發話人篩選"
    value={senderQuery}
    onChange={(e) => onSenderChange(e.target.value)}   // debounce 在元件內
    className="h-8 px-2.5 text-sm text-[--color-text-default] placeholder:text-[--color-text-placeholder] bg-[--color-surface-default] border border-[--color-border-default] rounded-sm focus:outline-none focus:border-[--color-border-focus] focus:ring-1 focus:ring-[--color-border-focus] min-w-[120px] flex-1"
  />

  {/* Body 篩選 */}
  <label htmlFor="body-filter" className="sr-only">依訊息內容篩選</label>
  <input
    id="body-filter"
    type="search"
    data-testid="body-filter"
    placeholder="關鍵字..."
    aria-label="依訊息內容篩選"
    value={bodyQuery}
    onChange={(e) => onBodyChange(e.target.value)}   // debounce 在元件內
    className="h-8 px-2.5 text-sm text-[--color-text-default] placeholder:text-[--color-text-placeholder] bg-[--color-surface-default] border border-[--color-border-default] rounded-sm focus:outline-none focus:border-[--color-border-focus] focus:ring-1 focus:ring-[--color-border-focus] min-w-[120px] flex-1"
  />

  {/* Mentioned Only Checkbox */}
  <label
    htmlFor="mentioned-filter"
    className="flex items-center gap-2 text-sm text-[--color-text-secondary] cursor-pointer min-h-[44px] px-2"
  >
    <input
      id="mentioned-filter"
      type="checkbox"
      data-testid="mentioned-filter"
      checked={mentionedOnly}
      onChange={(e) => onMentionedChange(e.target.checked)}
      aria-label="只顯示 @我的訊息"
      className="w-4 h-4 rounded-xs border border-[--color-border-strong] text-[--color-primary-500] focus:ring-1 focus:ring-[--color-border-focus] accent-[--color-primary-500]"
    />
    只看 @我
  </label>
</div>
