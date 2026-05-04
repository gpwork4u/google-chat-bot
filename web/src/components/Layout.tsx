import { NavLink, Outlet } from 'react-router-dom'
import ConnectionBadge from './ConnectionBadge'
import AutoModeToggle from './AutoModeToggle'

const navLinks = [
  { to: '/approvals', label: 'Approvals' },
  { to: '/sent', label: 'Sent' },
  { to: '/settings', label: 'Settings' },
]

export default function Layout() {
  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <header className="border-b border-gray-800 bg-gray-900">
        <nav className="mx-auto flex max-w-5xl items-center gap-4 px-4 py-3">
          <span className="mr-4 text-sm font-semibold tracking-wide text-indigo-400">
            Google Chat Agent
          </span>

          {navLinks.map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `rounded px-3 py-1 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-indigo-600 text-white'
                    : 'text-gray-400 hover:bg-gray-800 hover:text-gray-100'
                }`
              }
            >
              {label}
            </NavLink>
          ))}

          <div className="ml-auto flex items-center gap-3">
            <span className="text-xs text-gray-500">自動模式</span>
            <AutoModeToggle />
            <ConnectionBadge />
          </div>
        </nav>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  )
}
