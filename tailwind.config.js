/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)',
        surface: 'var(--surface)',
        'surface-2': 'var(--surface-2)',
        'surface-3': 'var(--surface-3)',
        label: 'var(--label)',
        'label-2': 'var(--label-2)',
        'label-3': 'var(--label-3)',
        separator: 'var(--separator)',
        accent: 'var(--accent)',
        'on-accent': 'var(--on-accent)',
        income: 'var(--income)',
        expense: 'var(--expense)',
        warn: 'var(--warn)',
        fill: 'var(--fill)',
      },
      fontFamily: {
        sans: ['-apple-system', '"SF Pro Text"', 'system-ui', 'sans-serif'],
        rounded: ['ui-rounded', '"SF Pro Rounded"', '-apple-system', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        'large-title': ['2.125rem', { lineHeight: '2.5625rem', fontWeight: '700', letterSpacing: '0.012em' }],
        title: ['1.75rem', { lineHeight: '2.125rem', fontWeight: '700' }],
        title3: ['1.25rem', { lineHeight: '1.5625rem', fontWeight: '600' }],
        headline: ['1.0625rem', { lineHeight: '1.375rem', fontWeight: '600', letterSpacing: '-0.026em' }],
        body: ['1.0625rem', { lineHeight: '1.375rem', letterSpacing: '-0.026em' }],
        subhead: ['0.9375rem', { lineHeight: '1.25rem', letterSpacing: '-0.015em' }],
        footnote: ['0.8125rem', { lineHeight: '1.125rem', letterSpacing: '-0.005em' }],
        caption: ['0.75rem', { lineHeight: '1rem' }],
        hero: ['2.75rem', { lineHeight: '3.25rem', fontWeight: '700', letterSpacing: '-0.01em' }],
      },
      borderRadius: { card: '20px', ctl: '14px', sheet: '28px' },
      boxShadow: { card: 'var(--shadow-card)', float: 'var(--shadow-float)' },
    },
  },
  plugins: [],
};
