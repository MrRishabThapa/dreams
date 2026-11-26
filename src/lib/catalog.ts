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
  purple: '#AF52DE',
  violet: '#7C3AED',
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

export interface DefaultCategory {
  name: string;
  type: CategoryType;
  icon: string;
  color: string;
  /** other names that count as this category already being there (no duplicate is added) */
  aliases?: string[];
}

/**
 * Default categories for new installs, in picker order. Existing installs get the ones they
 * don't have yet through `migrateCategories` (matched by name or alias, never duplicated).
 */
export const DEFAULT_CATEGORIES: DefaultCategory[] = [
  { name: 'Food', type: 'expense', icon: 'utensils', color: PALETTE.orange },
  { name: 'Groceries', type: 'expense', icon: 'shopping-cart', color: PALETTE.green, aliases: ['Grocery'] },
  { name: 'Eating Out', type: 'expense', icon: 'coffee', color: PALETTE.brown, aliases: ['Restaurants', 'Dining'] },
  { name: 'Transport', type: 'expense', icon: 'bus', color: PALETTE.blue, aliases: ['Travel & Transport', 'Travel'] },
  { name: 'Bills', type: 'expense', icon: 'receipt', color: PALETTE.teal, aliases: ['Utilities'] },
  { name: 'Rent', type: 'expense', icon: 'house', color: PALETTE.brown, aliases: ['Rent & Utilities'] },
  { name: 'Shopping', type: 'expense', icon: 'shopping-bag', color: PALETTE.pink },
  { name: 'Health', type: 'expense', icon: 'heart-pulse', color: PALETTE.red, aliases: ['Health & Medicine', 'Medicine'] },
  { name: 'Education', type: 'expense', icon: 'graduation-cap', color: PALETTE.indigo, aliases: ['Education & Courses', 'Courses'] },
  { name: 'Family', type: 'expense', icon: 'users', color: PALETTE.mint },
  { name: 'Entertainment', type: 'expense', icon: 'clapperboard', color: PALETTE.cyan },
  { name: 'Internet & Mobile data', type: 'expense', icon: 'wifi', color: PALETTE.cyan, aliases: ['Internet', 'Mobile data', 'Phone'] },
  { name: 'Clothing', type: 'expense', icon: 'shirt', color: PALETTE.purple, aliases: ['Clothes'] },
  { name: 'Personal Care', type: 'expense', icon: 'sparkles', color: PALETTE.pink },
  { name: 'Hobbies', type: 'expense', icon: 'palette', color: PALETTE.violet, aliases: ['Hobby'] },
  { name: 'Subscriptions', type: 'expense', icon: 'repeat', color: PALETTE.indigo, aliases: ['Subscription'] },
  { name: 'Gadgets & Electronics', type: 'expense', icon: 'laptop', color: PALETTE.blue, aliases: ['Gadgets', 'Electronics'] },
  { name: 'Watch & Accessories', type: 'expense', icon: 'watch', color: PALETTE.brown, aliases: ['Accessories'] },
  { name: 'Repairs & Maintenance', type: 'expense', icon: 'wrench', color: PALETTE.orange, aliases: ['Repairs', 'Maintenance'] },
  { name: 'Gifts & Donations', type: 'expense', icon: 'hand-heart', color: PALETTE.pink, aliases: ['Gifts', 'Donations'] },
  { name: 'Fees & Charges', type: 'expense', icon: 'badge-percent', color: PALETTE.gray, aliases: ['Fees', 'Charges'] },
  { name: 'Insurance', type: 'expense', icon: 'umbrella', color: PALETTE.teal },
  { name: 'Taxes', type: 'expense', icon: 'landmark', color: PALETTE.indigo, aliases: ['Tax'] },
  { name: 'Other', type: 'expense', icon: 'circle-ellipsis', color: PALETTE.gray },
  { name: 'Salary', type: 'income', icon: 'briefcase', color: PALETTE.green },
  { name: 'Business', type: 'income', icon: 'store', color: PALETTE.blue },
  { name: 'Gift', type: 'income', icon: 'gift', color: PALETTE.pink },
  { name: 'Interest', type: 'income', icon: 'percent', color: PALETTE.teal },
  { name: 'Other', type: 'income', icon: 'circle-ellipsis', color: PALETTE.gray },
];
