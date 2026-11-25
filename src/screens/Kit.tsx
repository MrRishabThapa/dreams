import { useState } from 'react';
import { Page } from '../ui/Page';
import { Button, IconButton, NavButton } from '../ui/Button';
import { Segmented } from '../ui/Segmented';
import { Group, Row } from '../ui/List';
import { Chip, EmptyState, ProgressRing, Sparkline, Toggle, Art } from '../ui/bits';
import { Icon, IconTile } from '../ui/Icon';
import { Keypad, applyKey } from '../ui/Keypad';
import { Money } from '../ui/Money';
import { Sheet } from '../ui/Sheet';
import { SwipeRow } from '../ui/SwipeRow';
import { TabBar, type Tab } from '../ui/TabBar';
import { ToastProvider, useToast } from '../ui/Toast';
import { ActionSheetProvider, useActionSheet } from '../ui/ActionSheet';
import { evalExpression, formatMoney } from '../domain/money';
import { DEFAULT_CATEGORIES } from '../lib/catalog';
import { Settings } from 'lucide-react';
import { applyTheme } from '../lib/app';

export function Kit() {
  return (
    <ToastProvider>
      <ActionSheetProvider>
        <KitBody />
      </ActionSheetProvider>
    </ToastProvider>
  );
}

const TOKENS = ['bg', 'surface', 'surface-2', 'label', 'label-2', 'separator', 'accent', 'income', 'expense', 'warn'];

function KitBody() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => (document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'));
  const [seg, setSeg] = useState<'a' | 'b' | 'c'>('a');
  const [on, setOn] = useState(true);
  const [expr, setExpr] = useState('250+120');
  const [sheet, setSheet] = useState(false);
  const [tab, setTab] = useState<Tab>('home');
  const [ring, setRing] = useState(0.62);
  const [val, setVal] = useState(12500000);
  const toast = useToast();
  const ask = useActionSheet();

  const switchTheme = (t: 'light' | 'dark') => {
    setTheme(t);
    applyTheme(t);
  };

  return (
    <Page title="Design Kit" right={<IconButton label="Settings"><Settings size={22} /></IconButton>}>
      <div className="px-4 pb-4">
        <Segmented value={theme} onChange={switchTheme} options={[{ value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} />
      </div>

      <Section title="Colors">
        <div className="card grid grid-cols-5 gap-3 p-4">
          {TOKENS.map((t) => (
            <div key={t} className="flex flex-col items-center gap-1">
              <span className="h-10 w-10 rounded-full border border-separator" style={{ background: `var(--${t})` }} />
              <span className="text-[10px] text-label-2">{t}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Typography">
        <div className="card space-y-1 p-4">
          <div className="text-large-title">Large Title</div>
          <div className="text-title">Title</div>
          <div className="text-headline">Headline</div>
          <div className="text-body">Body: the quick brown fox</div>
          <div className="text-subhead text-label-2">Subhead secondary</div>
          <div className="text-footnote text-label-2">Footnote</div>
          <div className="text-caption text-label-2">Caption</div>
          <Money value={val} animated className="rounded-num block text-hero" />
          <Money value={-5025} tone="auto" className="text-body" /> <Money value={150000} signed tone="income" className="text-body" />
        </div>
      </Section>

      <Section title="Buttons">
        <div className="card flex flex-col gap-3 p-4">
          <Button block onClick={() => setVal((v) => v + 1234500)}>Filled (animates hero)</Button>
          <div className="flex gap-2">
            <Button variant="tinted" size="md" className="flex-1">Tinted</Button>
            <Button variant="gray" size="md" className="flex-1">Gray</Button>
            <Button variant="destructive" size="md" className="flex-1">Delete</Button>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm">Small</Button>
            <NavButton>Cancel</NavButton>
            <NavButton bold>Save</NavButton>
            <Button size="md" disabled>Disabled</Button>
          </div>
        </div>
      </Section>

      <Section title="Segmented · Chips · Toggle">
        <div className="card flex flex-col gap-4 p-4">
          <Segmented value={seg} onChange={setSeg} options={[{ value: 'a', label: 'Expense' }, { value: 'b', label: 'Income' }, { value: 'c', label: 'Transfer' }]} />
          <div className="no-scrollbar flex gap-2 overflow-x-auto">
            <Chip active>Today</Chip>
            <Chip>Yesterday</Chip>
            <Chip icon={<Icon name="landmark" size={16} />}>Bank</Chip>
          </div>
          <div className="flex items-center justify-between">
            <span>Auto-sync</span>
            <Toggle checked={on} onChange={setOn} label="Auto-sync" />
          </div>
        </div>
      </Section>

      <Section title="Inset grouped list">
        <Group header="Cash & Bank" footer="Footer text explains the section.">
          <Row icon={<IconTile name="banknote" color="#34C759" />} title="Cash" subtitle="Cash" value={<Money value={1250000} />} chevron onPress={() => undefined} />
          <Row icon={<IconTile name="landmark" color="#007AFF" />} title="NIC Asia" value={<Money value={45000000} />} chevron onPress={() => undefined} />
          <Row title="Destructive" destructive onPress={() => undefined} />
        </Group>
      </Section>

      <Section title="Swipe actions">
        <div className="card overflow-hidden">
          <SwipeRow onDelete={() => toast({ message: 'Deleted', action: { label: 'Undo', onPress: () => toast({ message: 'Restored' }) } })} onEdit={() => toast({ message: 'Edit' })}>
            <Row icon={<IconTile name="utensils" color="#FF9500" />} title="Food" subtitle="Swipe left or right" value={<Money value={-45000} />} />
          </SwipeRow>
        </div>
      </Section>

      <Section title="Category grid">
        <div className="card grid grid-cols-4 gap-y-3 p-3">
          {DEFAULT_CATEGORIES.filter((c) => c.type === 'expense').slice(0, 8).map((c) => (
            <div key={c.name} className="flex flex-col items-center gap-1">
              <IconTile name={c.icon} color={c.color} size={42} />
              <span className="text-[11px] text-label-2">{c.name}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Keypad">
        <div className="card py-3">
          <div className="pb-2 text-center">
            <div className="text-footnote text-label-2 tnum">{expr || ' '}</div>
            <div className="rounded-num money text-[40px] font-bold">{formatMoney(evalExpression(expr) ?? 0)}</div>
          </div>
          <Keypad onKey={(k) => setExpr((e) => applyKey(e, k))} />
        </div>
      </Section>

      <Section title="Charts">
        <div className="card flex items-center justify-around p-4">
          <button type="button" onClick={() => setRing((r) => (r > 0.9 ? 0.1 : r + 0.2))}>
            <ProgressRing value={ring} size={64} stroke={7} color="var(--income)">
              <span className="text-[13px] font-semibold tnum">{Math.round(ring * 100)}%</span>
            </ProgressRing>
          </button>
          <Sparkline values={[40, 42, 39, 48, 52, 61]} width={140} height={48} />
        </div>
      </Section>

      <Section title="Overlays">
        <div className="card flex flex-col gap-2 p-4">
          <Button variant="tinted" size="md" onClick={() => setSheet(true)}>Open sheet</Button>
          <Button variant="tinted" size="md" onClick={() => toast({ message: 'Transaction deleted', action: { label: 'Undo', onPress: () => undefined } })}>Show toast</Button>
          <Button variant="tinted" size="md" onClick={() => void ask({ title: 'Delete account?', message: 'Its transactions will be deleted too.', options: [{ label: 'Delete Account', value: 'd', destructive: true }] })}>Action sheet</Button>
        </div>
      </Section>

      <Section title="Empty state">
        <div className="card">
          <EmptyState art={Art.coins} title="Nothing logged yet" message="One primary action, never a dead screen." action={<Button size="md">Add Transaction</Button>} />
        </div>
      </Section>

      <Sheet open={sheet} onClose={() => setSheet(false)} title="Sheet" detents={['medium', 'large']} left={<NavButton onClick={() => setSheet(false)}>Cancel</NavButton>} right={<NavButton bold onClick={() => setSheet(false)}>Done</NavButton>}>
        <Group header="Detents">
          <Row title="Drag the handle up for large" />
          <Row title="Drag down to dismiss" />
        </Group>
      </Sheet>

      <TabBar tab={tab} onTab={setTab} onAdd={() => toast({ message: 'Add tapped' })} />
    </Page>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-7 px-4" data-kit-section={title}>
      <h2 className="chrome mb-2 px-1 text-footnote font-semibold uppercase text-label-2">{title}</h2>
      {children}
    </section>
  );
}
