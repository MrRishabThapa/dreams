import { Plus } from 'lucide-react';
import { useState } from 'react';
import { Page } from '../ui/Page';
import { IconButton, Button } from '../ui/Button';
import { Segmented } from '../ui/Segmented';
import { Group, Row } from '../ui/List';
import { IconTile } from '../ui/Icon';
import { Money } from '../ui/Money';
import { EmptyState, Art } from '../ui/bits';
import { useApp } from '../lib/app';
import { liveAccounts, useBalances, useData } from '../db/hooks';
import { GROUP_ORDER, KIND_META } from '../lib/catalog';

export function MoneyScreen() {
  const data = useData();
  const bal = useBalances(data);
  const { openSheet } = useApp();
  const [seg, setSeg] = useState<'accounts' | 'debts'>('accounts');
  const accounts = liveAccounts(data);
  const archived = liveAccounts(data, true).filter((a) => a.archived);
  const total = accounts.reduce((s, a) => s + (bal.get(a.id) ?? 0), 0);

  return (
    <Page
      title="Money"
      right={<IconButton label="Add account" onClick={() => openSheet({ kind: 'account' })}><Plus size={26} /></IconButton>}
      below={
        <div className="px-4 pb-4">
          <Segmented value={seg} onChange={setSeg} options={[{ value: 'accounts', label: 'Accounts' }, { value: 'debts', label: 'Debts' }]} />
        </div>
      }
    >
      {seg === 'accounts' ? (
        <>
          <div className="mx-4 mb-5 flex items-baseline justify-between px-1">
            <span className="text-subhead text-label-2">Total in accounts</span>
            <Money value={total} animated className="rounded-num text-title3" />
          </div>
          <div className="flex flex-col gap-6">
            {GROUP_ORDER.map((g) => {
              const list = accounts.filter((a) => KIND_META[a.kind].group === g);
              if (!list.length) return null;
              const sum = list.reduce((s, a) => s + (bal.get(a.id) ?? 0), 0);
              return (
                <Group key={g} header={<span className="flex justify-between"><span>{g}</span><Money value={sum} className="normal-case" /></span>}>
                  {list.map((a) => (
                    <Row
                      key={a.id}
                      icon={<IconTile name={a.icon} color={a.color} />}
                      title={a.name}
                      subtitle={KIND_META[a.kind].label}
                      value={<Money value={bal.get(a.id) ?? 0} className={`${(bal.get(a.id) ?? 0) < 0 ? 'text-expense' : 'text-label'}`} />}
                      chevron
                      onPress={() => openSheet({ kind: 'accountDetail', id: a.id })}
                    />
                  ))}
                </Group>
              );
            })}
            <Group>
              <Row icon={<span className="flex h-[30px] w-[30px] items-center justify-center text-accent"><Plus size={22} /></span>} title="Add Account" accent onPress={() => openSheet({ kind: 'account' })} />
            </Group>
            {archived.length > 0 && (
              <Group header="Archived">
                {archived.map((a) => (
                  <Row key={a.id} icon={<IconTile name={a.icon} color="#8E8E93" />} title={a.name} chevron onPress={() => openSheet({ kind: 'accountDetail', id: a.id })} />
                ))}
              </Group>
            )}
          </div>
        </>
      ) : (
        <EmptyState
          art={Art.handshake}
          title="Debts are coming next"
          message="Track money you borrowed and lent, with payments and due dates. Arrives in the next update."
          action={<Button size="md" variant="tinted" onClick={() => setSeg('accounts')}>Back to Accounts</Button>}
        />
      )}
    </Page>
  );
}
