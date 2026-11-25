import {
  Banknote, Landmark, Smartphone, PiggyBank, TrendingUp, Utensils, Bus, Receipt, House, ShoppingBag, HeartPulse,
  GraduationCap, Users, Clapperboard, CircleEllipsis, Briefcase, Store, Gift, Percent, ArrowLeftRight, SlidersHorizontal,
  Wallet, type LucideIcon, type LucideProps,
} from 'lucide-react';

const MAP: Record<string, LucideIcon> = {
  banknote: Banknote, landmark: Landmark, smartphone: Smartphone, 'piggy-bank': PiggyBank, 'trending-up': TrendingUp,
  utensils: Utensils, bus: Bus, receipt: Receipt, house: House, 'shopping-bag': ShoppingBag, 'heart-pulse': HeartPulse,
  'graduation-cap': GraduationCap, users: Users, clapperboard: Clapperboard, 'circle-ellipsis': CircleEllipsis,
  briefcase: Briefcase, store: Store, gift: Gift, percent: Percent, transfer: ArrowLeftRight, adjust: SlidersHorizontal,
  wallet: Wallet,
};

export function Icon({ name, ...p }: { name: string | null | undefined } & Omit<LucideProps, 'name'>) {
  const C = (name && MAP[name]) || CircleEllipsis;
  return <C strokeWidth={1.9} {...p} />;
}

/** Rounded-square icon tile, like iOS Settings. */
export function IconTile({ name, color, size = 30, iconSize }: { name: string | null | undefined; color: string | null | undefined; size?: number; iconSize?: number }) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center text-white"
      style={{ width: size, height: size, borderRadius: size * 0.27, background: color ?? '#8E8E93' }}
      aria-hidden
    >
      <Icon name={name} size={iconSize ?? Math.round(size * 0.58)} />
    </span>
  );
}
