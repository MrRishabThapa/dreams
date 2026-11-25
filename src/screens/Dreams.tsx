import { Plus } from 'lucide-react';
import { useMemo } from 'react';
import { Page } from '../ui/Page';
import { Button, IconButton } from '../ui/Button';
import { EmptyState, Art } from '../ui/bits';
import { Money } from '../ui/Money';
import { DreamCard } from '../sheets/DreamSheets';
import { useApp } from '../lib/app';
import { liveDreams, useData } from '../db/hooks';
import { dreamProgress } from '../domain/dreams';
import { today } from '../domain/dates';

export function DreamsScreen() {
  const data = useData();
  const { openSheet } = useApp();
  const now = today();
  const items = useMemo(() => liveDreams(data).map((d) => ({ d, p: dreamProgress(d, data?.dream_entries ?? [], now) })), [data, now]);
  if (!data) return null;

  const active = items.filter((x) => !x.p.done);
  const done = items.filter((x) => x.p.done);
  const saved = active.reduce((s, x) => s + x.p.saved, 0);
  const target = active.reduce((s, x) => s + x.p.target, 0);

  return (
    <Page title="Dreams" right={<IconButton label="New dream" onClick={() => openSheet({ kind: 'dream' })}><Plus size={26} /></IconButton>}>
      {items.length === 0 ? (
        <EmptyState
          art={Art.moon}
          title="Fund your dreams"
          message="A trip, a laptop, an emergency fund. Set a target and watch it fill up."
          action={<Button size="md" onClick={() => openSheet({ kind: 'dream' })}>New Dream</Button>}
        />
      ) : (
        <div className="flex flex-col gap-6">
          {active.length > 0 && (
            <p className="mx-5 text-subhead text-label-2">
              <Money value={saved} className="font-semibold text-label" /> saved toward <Money value={target} /> across {active.length} dream{active.length === 1 ? '' : 's'}.
            </p>
          )}
          {active.length > 0 && (
            <div className="mx-4 grid grid-cols-2 gap-3">
              {active.map(({ d, p }) => (
                <DreamCard key={d.id} dream={d} progress={p} onPress={() => openSheet({ kind: 'dreamDetail', id: d.id })} />
              ))}
            </div>
          )}
          {done.length > 0 && (
            <section>
              <h3 className="chrome mx-8 mb-1.5 text-footnote uppercase text-label-2">Reached</h3>
              <div className="mx-4 grid grid-cols-2 gap-3">
                {done.map(({ d, p }) => (
                  <DreamCard key={d.id} dream={d} progress={p} onPress={() => openSheet({ kind: 'dreamDetail', id: d.id })} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </Page>
  );
}
