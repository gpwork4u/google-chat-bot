import { createContext, useContext } from 'react'
import useWebSocket, { ReadyState } from 'react-use-websocket'

const WS_URL = (() => {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${proto}//${location.host}/ws/ui`
})()

export interface WSMessage {
  type: string
  [key: string]: unknown
}

interface WSContextValue {
  lastMessage: WSMessage | null
  readyState: ReadyState
  sendMessage: (msg: unknown) => void
}

const WSContext = createContext<WSContextValue>({
  lastMessage: null,
  readyState: ReadyState.UNINSTANTIATED,
  sendMessage: () => {},
})

export function WebSocketProvider({ children }: { children: React.ReactNode }) {
  const { lastJsonMessage, readyState, sendJsonMessage } = useWebSocket<WSMessage>(
    WS_URL,
    {
      shouldReconnect: () => true,
      reconnectAttempts: 100,
      reconnectInterval: (attempt: number) => Math.min(1000 * 2 ** attempt, 30_000),
      share: true,
    },
  )

  return (
    <WSContext.Provider
      value={{
        lastMessage: lastJsonMessage,
        readyState,
        sendMessage: sendJsonMessage,
      }}
    >
      {children}
    </WSContext.Provider>
  )
}

export function useWS() {
  return useContext(WSContext)
}

export { ReadyState }
