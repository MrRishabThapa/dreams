import type { AccountKind, CategoryType } from '../domain/types';

/** Calm categorical palette (light value; dark is derived in CSS via tokens where needed). */
export const PALETTE = {
  blue: '#007AFF',
  green: '#34C759',
  orange: '#FF9500',
  red: '#FF3B30',
  teal: '#30B0C7',
  indigo: '#5856D6',
  pink: '#FF2D55',
  brown: '#A2845E',
  gray: '#8E8E93',
  yellow: '#FFCC00',
  mint: '#00C7BE',
  cyan: '#32ADE6',
} as const;

export const KIND_META: Record<AccountKind, { label: string; icon: string; color: string; group: string }> = {
  cash: { label: 'Cash', icon: 'banknote', color: PALETTE.green, group: 'Cash & Bank' },
  bank: { label: 'Bank', icon: 'landmark', color: PALETTE.blue, group: 'Cash & Bank' },
  wallet: { label: 'E-wallet', icon: 'smartphone', color: PALETTE.indigo, group: 'Cash & Bank' },
  savings: { label: 'Savings', icon: 'piggy-bank', color: PALETTE.orange, group: 'Savings' },
  investment: { label: 'Investment', icon: 'trending-up', color: PALETTE.teal, group: 'Investments' },
};

export const KIND_ORDER: AccountKind[] = ['cash', 'bank', 'wallet', 'savings', 'investment'];
export const GROUP_ORDER = ['Cash & Bank', 'Savings', 'Investments'];

export const DEFAULT_CATEGORIES: { name: string; type: CategoryType; icon: string; color: string }[] = [
  { name: 'Food', type: 'expense', icon: 'utensils', color: PALETTE.orange },
  { name: 'Transport', type: 'expense', icon: 'bus', color: PALETTE.blue },
  { name: 'Bills', type: 'expense', icon: 'receipt', color: PALETTE.teal },
  { name: 'Rent', type: 'expense', icon: 'house', color: PALETTE.brown },
  { name: 'Shopping', type: 'expense', icon: 'shopping-bag', color: PALETTE.pink },
  { name: 'Health', type: 'expense', icon: 'heart-pulse', color: PALETTE.red },
  { name: 'Education', type: 'expense', icon: 'graduation-cap', color: PALETTE.indigo },
  { name: 'Family', type: 'expense', icon: 'users', color: PALETTE.mint },
  { name: 'Entertainment', type: 'expense', icon: 'clapperboard', color: PALETTE.cyan },
  { name: 'Other', type: 'expense', icon: 'circle-ellipsis', color: PALETTE.gray },
  { name: 'Salary', type: 'income', icon: 'briefcase', color: PALETTE.green },
  { name: 'Business', type: 'income', icon: 'store', color: PALETTE.blue },
  { name: 'Gift', type: 'income', icon: 'gift', color: PALETTE.pink },
  { name: 'Interest', type: 'income', icon: 'percent', color: PALETTE.teal },
  { name: 'Other', type: 'income', icon: 'circle-ellipsis', color: PALETTE.gray },
];
