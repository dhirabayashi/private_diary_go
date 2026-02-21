import type { ReactNode } from 'react'
import { Header } from './Header'

interface PageLayoutProps {
  children: ReactNode
  title?: string
}

export function PageLayout({ children, title }: PageLayoutProps) {
  return (
    <div className="min-h-screen bg-stone-50">
      <Header />
      <main className="mx-auto max-w-5xl px-4 py-8">
        {title && (
          <h1 className="text-2xl font-bold text-stone-800 mb-6">{title}</h1>
        )}
        {children}
      </main>
    </div>
  )
}
