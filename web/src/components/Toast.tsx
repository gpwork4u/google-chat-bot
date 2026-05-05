import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { CheckCircle, XCircle, X } from 'lucide-react'

export type ToastType = 'success' | 'error'

interface ToastItem {
  id: number
  message: string
  type: ToastType
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastType) => void
}

const ToastContext = createContext<ToastContextValue>({
  showToast: () => {},
})

let nextId = 0

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const showToast = useCallback((message: string, type: ToastType = 'success') => {
    const id = ++nextId
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, 3000)
  }, [])

  const dismiss = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {/* Toast container */}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="fixed bottom-4 right-4 flex flex-col gap-2 z-[500]"
      >
        {toasts.map(toast => (
          <ToastItem key={toast.id} toast={toast} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

function ToastItem({ toast, onDismiss }: { toast: ToastItem; onDismiss: (id: number) => void }) {
  const [visible, setVisible] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    // 進場動畫
    const t = setTimeout(() => setVisible(true), 10)
    return () => clearTimeout(t)
  }, [])

  const handleDismiss = () => {
    setVisible(false)
    timerRef.current = setTimeout(() => onDismiss(toast.id), 200)
  }

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  const isSuccess = toast.type === 'success'

  return (
    <div
      role="status"
      data-testid="toast"
      className={[
        'flex items-center gap-3 px-4 py-3 rounded-md shadow-md',
        'text-sm font-medium text-white',
        'transition-all duration-200',
        isSuccess
          ? 'bg-[--color-success-default]'
          : 'bg-[--color-error-default]',
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2',
      ].join(' ')}
    >
      {isSuccess
        ? <CheckCircle size={16} aria-hidden="true" />
        : <XCircle size={16} aria-hidden="true" />
      }
      <span>{toast.message}</span>
      <button
        onClick={handleDismiss}
        className="ml-auto opacity-70 hover:opacity-100 transition-opacity"
        aria-label="關閉通知"
      >
        <X size={14} aria-hidden="true" />
      </button>
    </div>
  )
}

export function useToast() {
  return useContext(ToastContext)
}
