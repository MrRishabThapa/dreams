import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Sheet } from '../ui/Sheet';
import { NavButton, Button } from '../ui/Button';
import { Group, Row } from '../ui/List';
import { Segmented } from '../ui/Segmented';
import { Icon, IconTile, CATEGORY_ICONS } from '../ui/Icon';
import { SwipeRow } from '../ui/SwipeRow';
import { useToast } from '../ui/Toast';
import { useConfirm } from '../ui/ActionSheet';
import { useApp } from '../lib/app';
import { liveCategories, useData } from '../db/hooks';
import { patch, restore, save, softDelete } from '../db/repo';
import { PALETTE } from '../lib/catalog';
import type { Category, CategoryType } from '../domain/types';

const COLORS = Object.values(PALETTE);

export function CategoriesSheet({ open, onClose, z }: { open: boolean; onClose: () => void; z: number }) {
  const data = useData();
  const { openSheet } = useApp();
  const toast = useToast();
  const [type, setType] = useState<CategoryType>('expense');
  const list = liveCategories(data, type);

  const del = async (c: Category) => {
    if (list.length <= 1) return toast({ message: 'Keep at least one category', tone: 'error' });
    await softDelete('categories', [c.id]);
    toast({ message: `${c.name} deleted. Past transactions keep it.`, action: { label: 'Undo', onPress: () => void restore('categories', [c.id]) } });
  };

  const move = async (c: Category, dir: -1 | 1) => {
    const i = list.findIndex((x) => x.id === c.id);
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    const reordered = [...list];
    [reordered[i], reordered[j]] = [reordered[j], reordered[i]];
    await Promise.all(reordered.map((x, k) => (x.sort !== k ? patch('categories', x.id, { sort: k }) : null)));
  };

  return (
    <Sheet open={open} onClose={onClose} z={z} title="Categories" label="Categories" right={<NavButton bold onClick={onClose}>Done</NavButton>}>
      <div className="px-4 pb-5 pt-1">
        <Segmented value={type} onChange={setType} options={[{ value: 'expense', label: 'Expense' }, { value: 'income', label: 'Income' }]} />
      </div>
      <Group footer="Tap to edit. Swipe left to delete; past transactions keep their category. The first ones appear first in the Add sheet until you build up recent picks; the rest are under More.">
        {list.map((c, i) => (
          <SwipeRow key={c.id} onDelete={() => void del(c)} onEdit={() => openSheet({ kind: 'category', category: c, type })}>
            <div className="row sep flex min-h-[44px] items-center bg-surface">
              <button
                type="button"
                onClick={() => openSheet({ kind: 'category', category: c, type })}
                className="flex min-h-[44px] min-w-0 flex-1 items-center gap-3 pl-4 text-left active:bg-surface-3"
              >
                <IconTile name={c.icon} color={c.color} />
                <span className="row-body flex min-h-[44px] flex-1 items-center truncate py-2.5 text-body">{c.name}</span>
              </button>
              <span className="row-body flex self-stretch pr-2">
                <button type="button" aria-label={`Move ${c.name} up`} disabled={i === 0} onClick={() => void move(c, -1)} className="flex h-11 w-10 items-center justify-center text-label-2 disabled:opacity-25">↑</button>
                <button type="button" aria-label={`Move ${c.name} down`} disabled={i === list.length - 1} onClick={() => void move(c, 1)} className="flex h-11 w-10 items-center justify-center text-label-2 disabled:opacity-25">↓</button>
              </span>
            </div>
          </SwipeRow>
        ))}
      </Group>
      <Group className="mt-6">
        <Row icon={<span className="flex h-[30px] w-[30px] items-center justify-center text-accent"><Plus size={22} /></span>} title="Add Category" accent onPress={() => openSheet({ kind: 'category', type })} />
      </Group>
    </Sheet>
  );
}

export function CategorySheet({ open, onClose, category, type, z, onSaved }: { open: boolean; onClose: () => void; category?: Category; type: CategoryType; z: number; onSaved?: (c: Category) => void }) {
  const data = useData();
  const toast = useToast();
  const confirm = useConfirm();
  const [name, setName] = useState(category?.name ?? '');
  const [icon, setIcon] = useState(category?.icon ?? 'circle-ellipsis');
  const [color, setColor] = useState(category?.color ?? PALETTE.blue);
  const siblings = liveCategories(data, type);
  const clash = siblings.some((c) => c.id !== category?.id && c.name.trim().toLowerCase() === name.trim().toLowerCase());
  const valid = name.trim().length > 0 && !clash;

  const saveIt = async () => {
    if (!valid) return;
    if (category) await patch('categories', category.id, { name: name.trim(), icon, color });
    else {
      const sort = siblings.reduce((m, c) => Math.max(m, c.sort + 1), 0);
      // save first: onSaved?.(await save(…)) would skip the save when there's no callback
      const row = (await save('categories', { name: name.trim(), type, icon, color, sort } as Partial<Category>)) as Category;
      onSaved?.(row);
    }
    toast({ message: category ? 'Category saved' : `${name.trim()} added` });
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      z={z}
      title={category ? 'Edit Category' : 'New Category'}
      label={category ? 'Edit category' : 'New category'}
      left={<NavButton onClick={onClose}>Cancel</NavButton>}
      right={<NavButton bold disabled={!valid} onClick={saveIt}>{category ? 'Save' : 'Add'}</NavButton>}
    >
      <div className="flex justify-center pb-5 pt-2"><IconTile name={icon} color={color} size={64} /></div>
      <Group footer={clash ? 'There’s already a category with that name.' : undefined}>
        <label className="row sep flex min-h-[44px] items-center bg-surface pl-4">
          <input autoFocus={!category} value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" aria-label="Category name" maxLength={24} className="row-body h-11 flex-1 bg-transparent pr-4 text-[17px] outline-none placeholder:text-label-3" />
        </label>
      </Group>
      <Group header="Color" className="mt-6">
        <div className="grid grid-cols-7 gap-2 p-3" role="radiogroup" aria-label="Color">
          {COLORS.map((c) => (
            <button key={c} type="button" role="radio" aria-checked={color === c} aria-label={c} onClick={() => setColor(c)}
              className={`mx-auto h-10 w-10 rounded-full ${color === c ? 'ring-2 ring-accent ring-offset-2 ring-offset-[var(--surface)]' : ''}`} style={{ background: c }} />
          ))}
        </div>
      </Group>
      <Group header="Icon" className="mt-6">
        <div className="grid grid-cols-7 gap-1 p-2" role="radiogroup" aria-label="Icon">
          {CATEGORY_ICONS.map((i) => (
            <button key={i} type="button" role="radio" aria-checked={icon === i} aria-label={i} onClick={() => setIcon(i)}
              className={`flex h-11 items-center justify-center rounded-ctl ${icon === i ? 'bg-accent text-on-accent' : 'text-label-2 active:bg-fill'}`}>
              <Icon name={i} size={21} />
            </button>
          ))}
        </div>
      </Group>
      {category && (
        <div className="mx-4 mt-8">
          <Button variant="destructive" size="md" block onClick={async () => {
            if (siblings.length <= 1) return toast({ message: 'Keep at least one category', tone: 'error' });
            if (!(await confirm(`${category.name} will be removed from the list. Past transactions keep it.`, 'Delete Category'))) return;
            await softDelete('categories', [category.id]);
            onClose();
            toast({ message: `${category.name} deleted`, action: { label: 'Undo', onPress: () => void restore('categories', [category.id]) } });
          }}>Delete Category</Button>
        </div>
      )}
    </Sheet>
  );
}
