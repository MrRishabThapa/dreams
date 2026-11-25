import { motion } from 'framer-motion';
import { ChartPie, House, Moon, Plus, Wallet } from 'lucide-react';
import { SNAPPY, useSpring } from '../lib/motion';

export type Tab = 'home' | 'money' | 'dreams' | 'audit';

const ITEMS: { id: Tab; label: string; Icon: typeof House }[] = [
  { id: 'home', label: 'Home', Icon: House },
  { id: 'money', label: 'Money', Icon: Wallet },
  { id: 'dreams', label: 'Dreams', Icon: Moon },
  { id: 'audit', label: 'Audit', Icon: ChartPie },
];

export function TabBar({ tab, onTab, onAdd }: { tab: Tab; onTab: (t: Tab) => void; onAdd: () => void }) {
  const t = useSpring(SNAPPY);
  const btn = (it: (typeof ITEMS)[number]) => {
    const active = tab === it.id;
    return (
      <button
        key={it.id}
        type="button"
        role="tab"
        aria-selected={active}
        aria-label={it.label}
        onClick={() => onTab(it.id)}
        className={`flex flex-1 flex-col items-center justify-center gap-[3px] pt-[5px] ${active ? 'text-accent' : 'text-[#8E8E93]'}`}
      >
        <motion.span animate={{ scale: active ? 1 : 0.94 }} whileTap={{ scale: 0.86 }} transition={t} className="flex">
          <it.Icon size={25} strokeWidth={active ? 2.1 : 1.8} fill={active ? 'currentColor' : 'none'} fillOpacity={active ? 0.2 : 0} />
        </motion.span>
        <span className="text-[10px] font-medium leading-none tracking-[0.01em]">{it.label}</span>
      </button>
    );
  };
  return (
    <nav className="chrome material hairline-t fixed inset-x-0 bottom-0 z-40" style={{ paddingBottom: 'var(--safe-bottom)' }} role="tablist" aria-label="Tabs">
      <div className="flex h-[var(--tabbar-h)] items-stretch">
        {btn(ITEMS[0])}
        {btn(ITEMS[1])}
        <div className="flex flex-1 items-start justify-center">
          <motion.button
            type="button"
            aria-label="Add transaction"
            onClick={onAdd}
            whileTap={{ scale: 0.9 }}
            transition={t}
            className="-mt-[14px] flex h-[54px] w-[54px] items-center justify-center rounded-full bg-accent text-white"
            style={{ boxShadow: '0 6px 16px color-mix(in srgb, var(--accent) 40%, transparent), 0 0 0 4px var(--bg)' }}
          >
            <Plus size={28} strokeWidth={2.4} />
          </motion.button>
        </div>
        {btn(ITEMS[2])}
        {btn(ITEMS[3])}
      </div>
    </nav>
  );
}
