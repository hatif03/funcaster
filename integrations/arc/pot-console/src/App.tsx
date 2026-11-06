import { AboutPage } from "./components/AboutPage";
import { CreatePage } from "./components/CreatePage";
import { Header } from "./components/Header";
import { Nav } from "./components/Nav";
import { PotPage } from "./components/PotPage";
import { CONFIG } from "./config";
import { useView } from "./hooks/useView";

export default function App() {
  const { view, setView } = useView();
  return (
    <div className="min-h-dvh">
      <main className="mx-auto flex w-full max-w-xl flex-col gap-4 px-3 pb-10 pt-5 sm:px-6 sm:pt-10">
        <Header />
        <Nav view={view} onNavigate={setView} />
        {view === "pot" ? <PotPage config={CONFIG} /> : null}
        {view === "create" ? <CreatePage config={CONFIG} /> : null}
        {view === "about" ? <AboutPage config={CONFIG} /> : null}
        <p className="text-xs text-pretty text-[var(--subtle)]">
          Play money on Arc Testnet. This page reads public chain data over RPC.
          A wallet is used only if you press a button to create a pot, refund or
          claim. It sends no analytics.
        </p>
        <footer className="border-t border-[var(--border)] pt-3 text-sm text-[var(--subtle)]">
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
  );
}
