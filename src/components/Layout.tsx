import { NavLink, Outlet } from 'react-router-dom'
import type { ReactNode } from 'react'

function Icon({ path, filled }: { path: ReactNode; filled?: boolean }) {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {path}
    </svg>
  )
}

const tabs = [
  {
    to: '/',
    label: 'Home',
    end: true,
    icon: <path d="M3 10.5 12 3l9 7.5M5 9.5V21h14V9.5" />,
  },
  {
    to: '/calendar',
    label: 'Upcoming',
    end: false,
    icon: (
      <>
        <rect x="3" y="4.5" width="18" height="16" rx="2.5" />
        <path d="M3 9h18M8 2.5v4M16 2.5v4" />
      </>
    ),
  },
  {
    to: '/search',
    label: 'Search',
    end: false,
    icon: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </>
    ),
  },
  {
    to: '/profile',
    label: 'Profile',
    end: false,
    icon: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 20c0-3.5 3.6-6 8-6s8 2.5 8 6" />
      </>
    ),
  },
]

export function Layout() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col">
      <main className="flex-1 pb-28">
        <Outlet />
      </main>

      <nav
        className="glass fixed inset-x-0 bottom-0 z-20 border-t"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="mx-auto flex max-w-md px-2 py-1.5">
          {tabs.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.end}
              className={({ isActive }) =>
                `group relative flex flex-1 flex-col items-center gap-1 rounded-2xl py-2 text-[11px] font-medium transition-colors ${
                  isActive ? 'text-ink' : 'text-faint hover:text-muted'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={`transition-transform duration-200 ${
                      isActive ? '-translate-y-0.5 text-brand' : 'group-active:scale-90'
                    }`}
                  >
                    <Icon path={t.icon} filled={isActive} />
                  </span>
                  <span>{t.label}</span>
                  {isActive && (
                    <span className="absolute -top-0.5 h-1 w-1 rounded-full bg-brand shadow-[0_0_8px_2px] shadow-brand/60" />
                  )}
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
