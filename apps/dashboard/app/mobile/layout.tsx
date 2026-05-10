'use client'

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useAuth } from '@clerk/nextjs'
import Link from 'next/link'
import { GitPullRequest, Bell, Activity, LayoutDashboard } from 'lucide-react'

const NAV_ITEMS = [
  { href: '/mobile/prs',          label: 'All PRs',   icon: GitPullRequest },
  { href: '/mobile/notifications', label: 'Notifs',   icon: Bell },
  { href: '/mobile/health',        label: 'Sante',    icon: Activity },
  { href: '/mobile/dashboard',     label: 'Dashboard',icon: LayoutDashboard },
]

export default function MobileLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { isLoaded, isSignedIn } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (isLoaded && !isSignedIn) router.push('/sign-in')
  }, [isLoaded, isSignedIn, router])

  if (!isLoaded) {
    return (
      <div className="min-h-screen bg-[#0a0a0b] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }
  if (!isSignedIn) return null

  return (
    <div className="min-h-screen bg-[#0a0a0b] text-white flex flex-col max-w-md mx-auto relative">
      <header className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06] bg-[#0a0a0b] sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center">
            <span className="text-xs font-bold">AI</span>
          </div>
          <span className="font-semibold text-sm">Code Review</span>
        </div>
      </header>
      <main className="flex-1 overflow-y-auto pb-20">{children}</main>
      <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-[#111113] border-t border-white/[0.06] z-20">
        <div className="flex items-center justify-around px-2 py-2">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const active = pathname.startsWith(href)
            return (
              <Link key={href} href={href}
                className={`flex flex-col items-center gap-1 px-3 py-2 rounded-xl transition-all ${active ? 'text-indigo-400' : 'text-gray-500'}`}>
                <Icon size={22} strokeWidth={active ? 2.5 : 1.8} />
                <span className="text-[10px] font-medium">{label}</span>
                {active && <div className="w-1 h-1 rounded-full bg-indigo-400" />}
              </Link>
            )
          })}
        </div>
      </nav>
    </div>
  )
}
