import { useState, type FormEvent } from 'react';
import { RefreshCw } from 'lucide-react';
import { Sheet } from '../ui/Sheet';
import { Button, NavButton } from '../ui/Button';
import { Group, Row } from '../ui/List';
import { Toggle } from '../ui/bits';
import { SyncChip } from '../ui/SyncChip';
import { useToast } from '../ui/Toast';
import { useActionSheet } from '../ui/ActionSheet';
import { useApp } from '../lib/app';
import { patch } from '../db/repo';
import { useSync } from '../sync/useSync';
import { signIn, signOut, syncNow } from '../sync/controller';

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : 'Never';

/** Email + password sign-in form (no sign-up, no magic links). Shared with onboarding. */
export function SignInForm({ onSignedIn }: { onSignedIn?: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password || busy) return;
    setBusy(true);
    setError(null);
    const err = await signIn(email, password);
    setBusy(false);
    if (err) setError(err);
    else {
      setPassword('');
      onSignedIn?.();
    }
  };

  return (
    <form onSubmit={submit} noValidate>
      <Group footer="Use the account you created in Supabase. There’s no sign-up here, and no email links: type your password in this app.">
        <label className="row sep flex min-h-[44px] items-center bg-surface pl-4">
          <span className="row-body flex flex-1 items-center gap-3 pr-4">
            <span className="w-20 shrink-0 text-body">Email</span>
            <input
              type="email"
              inputMode="email"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              aria-label="Email"
              className="h-11 min-w-0 flex-1 bg-transparent text-[17px] outline-none placeholder:text-label-3"
            />
          </span>
        </label>
        <label className="row sep flex min-h-[44px] items-center bg-surface pl-4">
          <span className="row-body flex flex-1 items-center gap-3 pr-4">
            <span className="w-20 shrink-0 text-body">Password</span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Required"
              aria-label="Password"
              className="h-11 min-w-0 flex-1 bg-transparent text-[17px] outline-none placeholder:text-label-3"
            />
          </span>
        </label>
      </Group>
      {error && <p className="mx-8 mt-2 text-footnote font-medium text-expense" role="alert">{error}</p>}
      <div className="mx-4 mt-5">
        <Button type="submit" block disabled={!email.trim() || !password || busy}>{busy ? 'Signing In…' : 'Sign In'}</Button>
      </div>
    </form>
  );
}

export function SyncSheet({ open, onClose, z }: { open: boolean; onClose: () => void; z: number }) {
  const s = useSync();
  const { settings } = useApp();
  const toast = useToast();
  const ask = useActionSheet();

  const out = async () => {
    const a = await ask({
      title: 'Sign out of sync?',
      message: 'Dreams stops syncing on this iPhone. Everything stays here; nothing is deleted.',
      options: [{ label: 'Sign Out', value: 'out', destructive: true }],
    });
    if (a !== 'out') return;
    await signOut();
    toast({ message: 'Signed out. Your data is still here.' });
  };

  return (
    <Sheet open={open} onClose={onClose} z={z} title="Sync" label="Sync" right={<NavButton bold onClick={onClose}>Done</NavButton>}>
      {!s.configured ? (
        <p className="mx-8 mt-6 text-center text-subhead text-label-2">
          Sync isn’t set up in this build. It needs VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY at build time (see DEPLOY.md).
        </p>
      ) : s.signedIn === null ? null : !s.signedIn ? (
        <>
          <p className="mx-8 mb-5 mt-1 text-center text-subhead text-label-2">
            Sign in to back up to your Supabase project and keep your devices in step. Dreams keeps working offline either way.
          </p>
          <SignInForm onSignedIn={() => toast({ message: 'Signed in. Syncing…' })} />
        </>
      ) : (
        <>
          <Group className="mt-2">
            <Row title="Account" value={<span className="truncate" data-testid="sync-email">{s.email}</span>} />
            <Row title="Status" value={<SyncChip />} />
            <Row title="Last synced" value={when(s.lastSyncedAt)} />
            <Row title="Changes to send" value={<span className="tnum" data-testid="sync-pending">{s.pending}</span>} />
          </Group>
          {s.error && s.error.kind !== 'offline' && (
            <p className="mx-8 mt-2 text-footnote font-medium text-expense" role="alert" data-testid="sync-error">{s.error.message}</p>
          )}
          {!s.online && <p className="mx-8 mt-2 text-footnote text-label-2">You’re offline. Changes are saved here and sync when you’re back online.</p>}
          <div className="mx-4 mt-5">
            <Button block disabled={s.syncing || !s.online} onClick={() => void syncNow()}>
              <RefreshCw size={18} className={s.syncing ? 'animate-spin motion-reduce:animate-none' : ''} /> {s.syncing ? 'Syncing…' : 'Sync Now'}
            </Button>
          </div>
          <Group
            className="mt-6"
            footer={
              settings?.auto_sync
                ? 'Syncs when you open Dreams, when you come back online, and a few seconds after you change something.'
                : 'When you’re back online with unsynced changes, Dreams asks first.'
            }
          >
            <Row title="Auto-sync">
              <Toggle checked={!!settings?.auto_sync} onChange={(v) => settings && void patch('user_settings', settings.id, { auto_sync: v })} label="Auto-sync" />
            </Row>
          </Group>
          <Group className="mt-6">
            <Row title="Sign Out" destructive onPress={out} />
          </Group>
        </>
      )}
    </Sheet>
  );
}
