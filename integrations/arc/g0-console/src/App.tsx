import { useCallback } from 'react'
import { Header } from './components/Header'
import { Diagnostics } from './components/Diagnostics'
import { CONFIG } from './config'
import { readSnapshot } from './lib/reader'

export default function App() {
  const read = useCallback(() => readSnapshot(CONFIG), [])

  return (
    <div className="min-h-dvh">
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 pb-10 pt-8 sm:px-6 sm:pt-12">
        <Header />
        <Diagnostics config={CONFIG} read={read} />
        <p className="text-sm text-pretty text-[var(--subtle)]">
          This page only reads public chain data over RPC. It does not connect a wallet, sign, or send anything.
        </p>
        <footer className="border-t border-[var(--border)] pt-4 text-sm text-[var(--subtle)]">
          <a
            href="https://studio.arc.io"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center font-medium text-[var(--accent)] hover:text-[var(--accent-hover)]"
          >
            Built with Arc Studio
          </a>
        </footer>
      </main>
    </div>
  )
}
