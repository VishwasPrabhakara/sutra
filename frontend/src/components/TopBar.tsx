import { Brain } from 'lucide-react';

export default function TopBar() {
  return (
    <header className="sticky top-0 z-40 border-b border-surface-high bg-surface/80 backdrop-blur-md px-8 py-5 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-primary to-tertiary flex items-center justify-center shadow-[0_0_20px_rgba(79,219,200,0.3)]">
          <Brain className="w-5 h-5 text-surface" />
        </div>
        <div>
          <h1 className="font-extrabold text-xl tracking-tight">SUTRA</h1>
          <p className="text-[10px] uppercase tracking-[0.2em] text-on-surface-variant font-bold">
            Multi-Agent Chief of Staff
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest">
        <span className="w-2 h-2 rounded-full bg-primary animate-pulse"></span>
        <span className="text-primary">System Online · 6 Agents</span>
      </div>
    </header>
  );
}