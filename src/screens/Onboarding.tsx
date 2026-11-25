import { AnimatePresence, motion } from 'framer-motion';
import { Check, Share, SquarePlus } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../ui/Button';
import { Group, Row } from '../ui/List';
import { IconTile } from '../ui/Icon';
import { createAccount, ensureSettings, patch, seedCategories, setMeta } from '../db/repo';
import { KIND_META, KIND_ORDER } from '../lib/catalog';
import { parseMoney } from '../domain/money';
import { isStandalone } from '../lib/app';
import { useSpring } from '../lib/motion';
import { useRestore } from '../ui/useRestore';
import type { AccountKind } from '../domain/types';

type Step = 'install' | 'welcome' | 'account' | 'prefs';

export function Onboarding({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState<Step>(isStandalone() ? 'welcome' : 'install');
  const [name, setName] = useState('Cash');
  const [kind, setKind] = useState<AccountKind>('cash');
  const [bal, setBal] = useState('');
  const [symbol, setSymbol] = useState('Rs');
  const [target, setTarget] = useState('');
  const t = useSpring();
  const restore = useRestore({ confirmReplace: false, onDone });
  const balParsed = bal.trim() === '' ? 0 : parseMoney(bal);
  const targetParsed = target.trim() === '' ? null : parseMoney(target);

  const finish = async () => {
    const s = await ensureSettings();
    await patch('user_settings', s.id, { symbol: symbol.trim() || 'Rs', monthly_savings_target_minor: targetParsed && targetParsed > 0 ? targetParsed : null });
    await seedCategories();
    await createAccount({ name: name.trim() || KIND_META[kind].label, kind, opening_minor: balParsed ?? 0 });
    await setMeta('onboarded', true);
    try {
      await navigator.storage?.persist?.();
    } catch {
      /* not supported */
    }
    onDone();
  };

  const page = (key: Step, body: React.ReactNode) => (
    <motion.div key={key} initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }} transition={t} className="flex min-h-[100dvh] flex-col" style={{ paddingTop: 'calc(var(--safe-top) + 24px)', paddingBottom: 'calc(var(--safe-bottom) + 16px)' }}>
      {body}
    </motion.div>
  );

  return (
    <div className="min-h-[100dvh] overflow-hidden bg-bg">
      <AnimatePresence mode="wait" initial={false}>
        {step === 'install' &&
          page(
            'install',
            <>
              <div className="flex flex-1 flex-col items-center px-8 pt-10 text-center">
                <img src="/apple-touch-icon.png" alt="" className="h-20 w-20 rounded-[18px] shadow-card" />
                <h1 className="mt-6 text-title">Install Dreams first</h1>
                <p className="mt-2 text-body text-label-2">Your money data lives on this iPhone. Safari and the Home Screen app keep separate storage, so install the app before you add anything.</p>
                <div className="card mt-8 w-full p-4 text-left">
                  <Step n={1} icon={<Share size={18} className="text-accent" />}>Tap <b>Share</b> in Safari’s toolbar</Step>
                  <Step n={2} icon={<SquarePlus size={18} className="text-accent" />}>Choose <b>Add to Home Screen</b></Step>
                  <Step n={3} icon={<img src="/apple-touch-icon.png" alt="" className="h-[18px] w-[18px] rounded-[4px]" />}>Open <b>Dreams</b> from your Home Screen</Step>
                </div>
              </div>
              <div className="px-6">
                <Button variant="plain" block onClick={() => setStep('welcome')}>Continue in the browser</Button>
              </div>
            </>,
          )}
        {step === 'welcome' &&
          page(
            'welcome',
            <>
              <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
                <img src="/apple-touch-icon.png" alt="" className="h-24 w-24 rounded-[22px] shadow-card" />
                <h1 className="mt-6 text-[40px] font-bold leading-tight tracking-tight">Dreams</h1>
                <p className="mt-2 text-title3 font-normal text-label-2">Know your money.<br />Fund your dreams.</p>
                <div className="mt-10 w-full space-y-4 text-left">
                  <Feature title="Everything in one place" body="Cash, bank, wallets, savings and investments." />
                  <Feature title="Works offline" body="Add an expense in seconds, even with no signal." />
                  <Feature title="A real monthly audit" body="See where it went and what you saved." />
                </div>
              </div>
              <div className="flex flex-col gap-1 px-6">
                <Button block onClick={() => setStep('account')}>Get Started</Button>
                <Button variant="plain" block onClick={restore.open}>Restore from a Backup</Button>
                {restore.input}
              </div>
            </>,
          )}
        {step === 'account' &&
          page(
            'account',
            <>
              <div className="flex-1 overflow-y-auto">
                <div className="px-8 pb-6 pt-4 text-center">
                  <div className="text-footnote font-semibold uppercase text-label-2">Step 1 of 2</div>
                  <h1 className="mt-1 text-title">Your first account</h1>
                  <p className="mt-2 text-subhead text-label-2">Start with what you hold right now. You can add the rest later.</p>
                </div>
                <Group>
                  <label className="row sep flex min-h-[44px] items-center bg-surface pl-4">
                    <span className="row-body flex flex-1 items-center gap-3 pr-4">
                      <span className="w-20 text-body">Name</span>
                      <input value={name} onChange={(e) => setName(e.target.value)} aria-label="Account name" maxLength={40} className="h-11 min-w-0 flex-1 bg-transparent text-[17px] outline-none" />
                    </span>
                  </label>
                  <label className="row sep flex min-h-[44px] items-center bg-surface pl-4">
                    <span className="row-body flex flex-1 items-center gap-3 pr-4">
                      <span className="w-20 text-body">Balance</span>
                      <input value={bal} onChange={(e) => setBal(e.target.value)} inputMode="decimal" placeholder="0" aria-label="Current balance" className="money h-11 min-w-0 flex-1 bg-transparent text-[17px] outline-none placeholder:text-label-3" />
                    </span>
                  </label>
                </Group>
                <Group header="Type" className="mt-6">
                  {KIND_ORDER.map((k) => (
                    <Row
                      key={k}
                      icon={<IconTile name={KIND_META[k].icon} color={KIND_META[k].color} />}
                      title={KIND_META[k].label}
                      onPress={() => {
                        if (name === KIND_META[kind].label || name.trim() === '') setName(KIND_META[k].label);
                        setKind(k);
                      }}
                    >
                      {kind === k && <Check size={20} className="text-accent" strokeWidth={2.6} />}
                    </Row>
                  ))}
                </Group>
              </div>
              <div className="px-6 pt-4">
                <Button block disabled={balParsed === null || !name.trim()} onClick={() => setStep('prefs')}>Continue</Button>
              </div>
            </>,
          )}
        {step === 'prefs' &&
          page(
            'prefs',
            <>
              <div className="flex-1">
                <div className="px-8 pb-6 pt-4 text-center">
                  <div className="text-footnote font-semibold uppercase text-label-2">Step 2 of 2</div>
                  <h1 className="mt-1 text-title">Currency &amp; target</h1>
                  <p className="mt-2 text-subhead text-label-2">Amounts use lakh and crore grouping. A savings target is optional.</p>
                </div>
                <Group footer="Your monthly audit measures what you saved against this.">
                  <label className="row sep flex min-h-[44px] items-center bg-surface pl-4">
                    <span className="row-body flex flex-1 items-center gap-3 pr-4">
                      <span className="flex-1 text-body">Currency symbol</span>
                      <input value={symbol} onChange={(e) => setSymbol(e.target.value)} maxLength={6} aria-label="Currency symbol" className="h-11 w-24 bg-transparent text-right text-[17px] outline-none" />
                    </span>
                  </label>
                  <label className="row sep flex min-h-[44px] items-center bg-surface pl-4">
                    <span className="row-body flex flex-1 items-center gap-3 pr-4">
                      <span className="flex-1 text-body">Save each month</span>
                      <input value={target} onChange={(e) => setTarget(e.target.value)} inputMode="decimal" placeholder="Optional" aria-label="Monthly savings target" className="money h-11 w-32 bg-transparent text-right text-[17px] outline-none placeholder:text-label-3" />
                    </span>
                  </label>
                </Group>
              </div>
              <div className="flex flex-col gap-2 px-6">
                <Button block disabled={target.trim() !== '' && targetParsed === null} onClick={finish}>Start Using Dreams</Button>
                <Button variant="plain" block onClick={() => setStep('account')}>Back</Button>
              </div>
            </>,
          )}
      </AnimatePresence>
    </div>
  );
}

function Step({ n, icon, children }: { n: number; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 py-2">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-fill text-footnote font-semibold">{n}</span>
      <span className="flex-1 text-subhead">{children}</span>
      {icon}
    </div>
  );
}

function Feature({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex gap-3">
      <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-accent" />
      <div>
        <div className="text-headline">{title}</div>
        <div className="text-subhead text-label-2">{body}</div>
      </div>
    </div>
  );
}
