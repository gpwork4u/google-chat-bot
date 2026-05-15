import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import ApprovalsPage from './pages/ApprovalsPage'
import SentPage from './pages/SentPage'
import SettingsPage from './pages/SettingsPage'
import PendingPage from './pages/PendingPage'
import SpaceFactsCandidatesPage from './pages/SpaceFactsCandidatesPage'
import SpaceFactsDetailPage from './pages/SpaceFactsDetailPage'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Navigate to="/approvals" replace />} />
        <Route path="approvals" element={<ApprovalsPage />} />
        <Route path="sent" element={<SentPage />} />
        <Route path="pending" element={<PendingPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="space-facts/candidates" element={<SpaceFactsCandidatesPage />} />
        <Route path="space-facts/*" element={<SpaceFactsDetailPage />} />
      </Route>
    </Routes>
  )
}
