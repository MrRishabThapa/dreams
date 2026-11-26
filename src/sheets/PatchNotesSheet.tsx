import { ChevronLeft } from 'lucide-react';
import { Sheet } from '../ui/Sheet';
import { NavButton } from '../ui/Button';
import { PATCH_NOTES, type PatchItem } from '../data/patchNotes';

const GROUPS: { key: 'new' | 'improved' | 'fixed'; label: string }[] = [
  { key: 'new', label: 'New' },
  { key: 'improved', label: 'Improved' },
  { key: 'fixed', label: 'Fixed' },
];

function releaseDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function PatchNotesSheet({ open, onClose, z }: { open: boolean; onClose: () => void; z: number }) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      z={z}
      title="Patch notes"
      label="Patch notes"
      left={
        <NavButton onClick={onClose} className="-ml-2 flex items-center" aria-label="Back to Settings">
          <ChevronLeft size={26} strokeWidth={2.4} className="-mr-0.5" aria-hidden />
          Settings
        </NavButton>
      }
    >
      <p className="mx-5 mt-1 text-[16px] leading-[22px] text-label-2">
        You’re on <strong className="font-semibold text-label">version {__APP_VERSION__}</strong>. Here’s what changed in each release, newest first.
      </p>
      {PATCH_NOTES.map((n, i) => (
        <article key={n.version} className="card mx-4 mt-4 px-4 pb-4 pt-3.5" aria-labelledby={`v-${n.version}`} data-testid="patch-card">
          <header className="flex items-center gap-2">
            <h2 id={`v-${n.version}`} className="text-title3 text-label">v{n.version}</h2>
            {i === 0 && (
              <span className="rounded-full bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] px-2 py-0.5 text-caption font-semibold text-accent">Latest</span>
            )}
            <time dateTime={n.date} className="ml-auto shrink-0 text-footnote text-label-2">{releaseDate(n.date)}</time>
          </header>
          <div className="my-3 h-px bg-separator" aria-hidden />
          {GROUPS.filter((g) => n.groups[g.key]?.length).map((g, gi) => (
            <section key={g.key} className={gi ? 'mt-4' : ''} aria-label={`${g.label} in v${n.version}`}>
              <h3 className="text-caption font-semibold uppercase tracking-[0.06em] text-label-2">{g.label}</h3>
              <ul className="mt-1.5 space-y-2">
                {n.groups[g.key]!.map((it) => (
                  <Bullet key={it.keyword} item={it} />
                ))}
              </ul>
            </section>
          ))}
        </article>
      ))}
    </Sheet>
  );
}

function Bullet({ item }: { item: PatchItem }) {
  return (
    <li className="flex gap-2.5 text-[16px] leading-[22px] text-label-2">
      <span className="mt-[9px] h-[5px] w-[5px] shrink-0 rounded-full bg-accent" aria-hidden />
      <span>
        <strong className="font-semibold text-accent">{item.keyword}</strong>: {item.text}
      </span>
    </li>
  );
}
