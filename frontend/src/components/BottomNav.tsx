import { Zap, Calendar, ScrollText, BookOpen } from 'lucide-react';

export type Screen = 'orchestrate' | 'schedule' | 'logs' | 'knowledge';

interface Props {
  current: Screen;
  onChange: (screen: Screen) => void;
}

const TABS: Array<{ id: Screen; label: string; icon: typeof Zap }> = [
  { id: 'orchestrate', label: 'Orchestrate', icon: Zap },
  { id: 'schedule', label: 'Schedule', icon: Calendar },
  { id: 'logs', label: 'Logs', icon: ScrollText },
  { id: 'knowledge', label: 'Knowledge', icon: BookOpen },
];

export default function BottomNav({ current, onChange }: Props) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-surface-high bg-surface/90 backdrop-blur-md">
      <div className="max-w-6xl mx-auto flex items-center justify-around px-4 py-3">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = current === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onChange(tab.id)}
              className={`flex flex-col items-center gap-1 px-4 py-2 rounded-2xl transition-all ${
                isActive
                  ? 'bg-primary/10 text-primary'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[10px] uppercase tracking-widest font-bold">
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}