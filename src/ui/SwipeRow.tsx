import { animate, motion, useMotionValue, useTransform, type PanInfo } from 'framer-motion';
import { Pencil, Trash2 } from 'lucide-react';
import { useRef, type ReactNode } from 'react';

const ACTION_W = 80;

/**
 * Swipe left = Delete (red), swipe right = Edit (accent). A full swipe triggers the
 * action; a partial swipe reveals the button. Only transform is animated.
 */
export function SwipeRow({ children, onDelete, onEdit }: { children: ReactNode; onDelete?: () => void; onEdit?: () => void }) {
  const x = useMotionValue(0);
  const width = useRef(375);
  const ref = useRef<HTMLDivElement>(null);
  const delOpacity = useTransform(x, [-40, -10], [1, 0]);
  const editOpacity = useTransform(x, [10, 40], [0, 1]);
  const settle = (to: number) => animate(x, to, { type: 'spring', stiffness: 500, damping: 42 });

  const onDragEnd = (_: unknown, i: PanInfo) => {
    const w = width.current;
    const dx = x.get();
    if (onDelete && (dx < -w * 0.55 || (dx < -ACTION_W && i.velocity.x < -900))) {
      settle(-w);
      setTimeout(() => { onDelete(); x.set(0); }, 180);
    } else if (onEdit && (dx > w * 0.45 || (dx > ACTION_W && i.velocity.x > 900))) {
      settle(0);
      onEdit();
    } else if (onDelete && dx < -ACTION_W / 2) settle(-ACTION_W);
    else if (onEdit && dx > ACTION_W / 2) settle(ACTION_W);
    else settle(0);
  };

  return (
    <div ref={ref} className="swipe sep relative overflow-hidden" onPointerDown={() => (width.current = ref.current?.offsetWidth ?? 375)}>
      {onEdit && (
        <motion.button
          type="button"
          aria-label="Edit"
          style={{ opacity: editOpacity }}
          onClick={() => { settle(0); onEdit(); }}
          className="absolute inset-y-0 left-0 flex w-full items-center justify-start bg-accent pl-7 text-on-accent"
        >
          <Pencil size={22} />
        </motion.button>
      )}
      {onDelete && (
        <motion.button
          type="button"
          aria-label="Delete"
          style={{ opacity: delOpacity }}
          onClick={() => { settle(0); onDelete(); }}
          className="absolute inset-y-0 right-0 flex w-full items-center justify-end bg-expense pr-7 text-white"
        >
          <Trash2 size={22} />
        </motion.button>
      )}
      <motion.div
        drag="x"
        dragDirectionLock
        dragConstraints={{ left: onDelete ? -10000 : 0, right: onEdit ? 10000 : 0 }}
        dragElastic={0.05}
        dragMomentum={false}
        style={{ x, touchAction: 'pan-y' }}
        onDragEnd={onDragEnd}
        className="relative bg-surface"
      >
        {children}
      </motion.div>
    </div>
  );
}
