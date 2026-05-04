import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App'
import { WebSocketProvider } from './ws/WebSocketProvider'
import { ToastProvider } from './components/Toast'

const rootEl = document.getElementById('root')
if (!rootEl) throw new Error('Root element not found')

createRoot(rootEl).render(
  <StrictMode>
    <BrowserRouter>
      <WebSocketProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </WebSocketProvider>
    </BrowserRouter>
  </StrictMode>,
)
