// Toast — 使用範例
// 基於 Tailwind v4 + Lucide React + React Portal
// 參考 design/components/Toast/spec.md

import { CheckCircle, XCircle, Info, X } from "lucide-react";
import { useState, useEffect, useCallback, createContext, useContext, ReactNode } from "react";
import { createPortal } from "react-dom";

type ToastVariant = "success" | "error" | "info";

interface ToastItem {
  id: string;
  variant: ToastVariant;
  message: string;
  duration: number;
}

// ---- Toast Context ----
interface ToastContextValue {
  addToast: (opts: Omit<ToastItem, "id">) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

// ---- 單個 Toast ----
interface ToastProps {
  item: ToastItem;
  onClose: (id: string) => void;
}

const VARIANT_CONFIG: Record<
  ToastVariant,
  { role: string; ariaLive: string; bgClass: string; textClass: string; iconColorClass: string; Icon: typeof CheckCircle }
> = {
  success: {
    role: "status",
    ariaLive: "polite",
    bgClass: "bg-[--color-toast-success-bg]",
    textClass: "text-[--color-toast-success-text]",
    iconColorClass: "text-[--color-toast-success-icon]",
    Icon: CheckCircle,
  },
  error: {
    role: "alert",
    ariaLive: "assertive",
    bgClass: "bg-[--color-toast-error-bg]",
    textClass: "text-[--color-toast-error-text]",
    iconColorClass: "text-[--color-toast-error-icon]",
    Icon: XCircle,
  },
  info: {
    role: "status",
    ariaLive: "polite",
    bgClass: "bg-[--color-neutral-800]",
    textClass: "text-[--color-neutral-100]",
    iconColorClass: "text-[--color-info-default]",
    Icon: Info,
  },
};

function Toast({ item, onClose }: ToastProps) {
  const [visible, setVisible] = useState(false);  // 進場動畫用
  const [exiting, setExiting] = useState(false);

  const config = VARIANT_CONFIG[item.variant];
  const { Icon } = config;

  // 進場
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 10);
    return () => clearTimeout(t);
  }, []);

  // 自動關閉
  useEffect(() => {
    if (item.duration === 0) return;
    const t = setTimeout(() => handleClose(), item.duration);
    return () => clearTimeout(t);
  }, [item.duration]);

  const handleClose = () => {
    setExiting(true);
    setTimeout(() => onClose(item.id), 200);
  };

  return (
    <div
      role={config.role}
      aria-live={config.ariaLive as any}
      className={[
        "flex items-center gap-3",
        "min-w-[240px] max-w-[360px]",
        "px-4 py-3",
        "rounded-md",
        "shadow-[--shadow-elevated]",
        "pointer-events-auto",
        config.bgClass,
        config.textClass,
        // 動畫
        "transition-all duration-300 ease-out",
        visible && !exiting
          ? "opacity-100 translate-x-0"
          : exiting
          ? "opacity-0 translate-x-4"
          : "opacity-0 translate-x-8",
        // reduced-motion
        "motion-reduce:transition-none",
      ].join(" ")}
    >
      {/* Icon */}
      <Icon
        size={16}
        aria-hidden="true"
        className={["flex-shrink-0", config.iconColorClass].join(" ")}
      />

      {/* 訊息 */}
      <p className="flex-1 text-sm">{item.message}</p>

      {/* 關閉按鈕 */}
      <button
        type="button"
        onClick={handleClose}
        aria-label="關閉通知"
        className={[
          "flex items-center justify-center ml-auto",
          "w-5 h-5 flex-shrink-0",
          "opacity-60 hover:opacity-100",
          "transition-opacity duration-150",
          "focus:outline-none focus-visible:ring-1 focus-visible:ring-white",
          "rounded-sm",
        ].join(" ")}
      >
        <X size={13} aria-hidden="true" />
      </button>
    </div>
  );
}

// ---- ToastContainer ----
interface ToastContainerProps {
  toasts: ToastItem[];
  onClose: (id: string) => void;
}

function ToastContainer({ toasts, onClose }: ToastContainerProps) {
  return createPortal(
    <div
      aria-label="通知區域"
      className={[
        "fixed bottom-4 right-4",
        "flex flex-col-reverse gap-2",
        "z-[--z-toast]",
        "pointer-events-none",
      ].join(" ")}
    >
      {toasts.map((item) => (
        <Toast key={item.id} item={item} onClose={onClose} />
      ))}
    </div>,
    document.body
  );
}

// ---- ToastProvider ----
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const MAX_TOASTS = 3;

  const addToast = useCallback(
    ({ variant = "success", message, duration = 3000 }: Omit<ToastItem, "id">) => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      setToasts((prev) => {
        const next = [...prev, { id, variant, message, duration }];
        // 超過上限移除最舊的
        return next.length > MAX_TOASTS ? next.slice(next.length - MAX_TOASTS) : next;
      });
    },
    []
  );

  const closeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
      <ToastContainer toasts={toasts} onClose={closeToast} />
    </ToastContext.Provider>
  );
}

// ---- 使用示範 ----

// 1. 在 App.tsx 根層包裝 ToastProvider
function App() {
  return (
    <ToastProvider>
      {/* ... 其他元件 */}
    </ToastProvider>
  );
}

// 2. 在任意元件內使用 useToast
function SettingsDemo() {
  const { addToast } = useToast();

  return (
    <div className="space-y-2">
      {/* 設定儲存成功 */}
      <button
        type="button"
        onClick={() => addToast({ variant: "success", message: "已儲存" })}
        className="..."
      >
        儲存設定
      </button>

      {/* 設定儲存失敗 */}
      <button
        type="button"
        onClick={() =>
          addToast({ variant: "error", message: "儲存失敗，請重試", duration: 5000 })
        }
        className="..."
      >
        觸發錯誤
      </button>

      {/* 中性資訊 */}
      <button
        type="button"
        onClick={() => addToast({ variant: "info", message: "已丟棄草稿" })}
        className="..."
      >
        丟棄
      </button>

      {/* 永久不關閉（duration=0） */}
      <button
        type="button"
        onClick={() =>
          addToast({ variant: "error", message: "無法連線，請檢查網路", duration: 0 })
        }
        className="..."
      >
        網路錯誤
      </button>
    </div>
  );
}
