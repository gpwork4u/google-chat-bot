import { ReadyState } from 'react-use-websocket'
import { useWS } from '../ws/WebSocketProvider'

const stateLabel: Record<ReadyState, string> = {
  [ReadyState.CONNECTING]: '連線中',
  [ReadyState.OPEN]: '已連線',
  [ReadyState.CLOSING]: '關閉中',
  [ReadyState.CLOSED]: '離線',
  [ReadyState.UNINSTANTIATED]: '離線',
}

const stateClass: Record<ReadyState, string> = {
  [ReadyState.CONNECTING]: 'bg-yellow-500',
  [ReadyState.OPEN]: 'bg-green-500',
  [ReadyState.CLOSING]: 'bg-yellow-500',
  [ReadyState.CLOSED]: 'bg-red-500',
  [ReadyState.UNINSTANTIATED]: 'bg-gray-500',
}

export default function ConnectionBadge() {
  const { readyState } = useWS()
  const label = stateLabel[readyState] ?? '離線'
  const dotClass = stateClass[readyState] ?? 'bg-gray-500'

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium text-white"
      data-testid="connection-badge"
      aria-label={`連線狀態: ${label}`}
    >
      <span className={`inline-block h-2 w-2 rounded-full ${dotClass}`} />
      {label}
    </span>
  )
}
