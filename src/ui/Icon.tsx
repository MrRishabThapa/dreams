import {
  Banknote, Landmark, Smartphone, PiggyBank, TrendingUp, Utensils, Bus, Receipt, House, ShoppingBag, HeartPulse,
  GraduationCap, Users, Clapperboard, CircleEllipsis, Briefcase, Store, Gift, Percent, ArrowLeftRight, SlidersHorizontal,
  Wallet, Plane, Car, Laptop, Heart, Bike, Camera, Gem, TreePalm, Shield, Baby, Music, Star, Coffee, Fuel, Wifi, Dumbbell,
  Shirt, PawPrint, Plug, Pill, BookOpen, Gamepad2, Ticket, Wrench, Coins, Building2, HandHeart,
  Watch, ShoppingCart, Sparkles, Repeat, Palette, Umbrella, BadgePercent, Headphones, Scissors, Hammer,
  type LucideIcon, type LucideProps,
} from 'lucide-react';

const MAP: Record<string, LucideIcon> = {
  banknote: Banknote, landmark: Landmark, smartphone: Smartphone, 'piggy-bank': PiggyBank, 'trending-up': TrendingUp,
  utensils: Utensils, bus: Bus, receipt: Receipt, house: House, 'shopping-bag': ShoppingBag, 'heart-pulse': HeartPulse,
  'graduation-cap': GraduationCap, users: Users, clapperboard: Clapperboard, 'circle-ellipsis': CircleEllipsis,
  briefcase: Briefcase, store: Store, gift: Gift, percent: Percent, transfer: ArrowLeftRight, adjust: SlidersHorizontal,
  wallet: Wallet, plane: Plane, car: Car, laptop: Laptop, heart: Heart, bike: Bike, camera: Camera, gem: Gem,
  'tree-palm': TreePalm, shield: Shield, baby: Baby, music: Music, star: Star, coffee: Coffee, fuel: Fuel, wifi: Wifi,
  dumbbell: Dumbbell, shirt: Shirt, 'paw-print': PawPrint, plug: Plug, pill: Pill, 'book-open': BookOpen,
  gamepad: Gamepad2, ticket: Ticket, wrench: Wrench, coins: Coins, building: Building2, 'hand-heart': HandHeart,
  watch: Watch, 'shopping-cart': ShoppingCart, sparkles: Sparkles, repeat: Repeat, palette: Palette, umbrella: Umbrella,
  'badge-percent': BadgePercent, headphones: Headphones, scissors: Scissors, hammer: Hammer,
};

/** Icons offered in the category editor. */
export const CATEGORY_ICONS = [
  'utensils', 'coffee', 'shopping-cart', 'bus', 'fuel', 'car', 'bike', 'plane', 'receipt', 'plug', 'wifi', 'house',
  'shopping-bag', 'shirt', 'watch', 'gem', 'sparkles', 'scissors', 'heart-pulse', 'pill', 'dumbbell', 'graduation-cap',
  'book-open', 'users', 'baby', 'paw-print', 'clapperboard', 'gamepad', 'ticket', 'music', 'headphones', 'palette',
  'camera', 'laptop', 'smartphone', 'repeat', 'gift', 'hand-heart', 'wrench', 'hammer', 'umbrella', 'shield',
  'badge-percent', 'landmark', 'building', 'briefcase', 'store', 'coins', 'circle-ellipsis',
];

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
