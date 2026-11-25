import { Delete } from 'lucide-react';
import { useRef } from 'react';

export type KeyValue = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '.' | 'back' | 'clear' | '+' | '-' | '×' | '÷';

const ROWS: KeyValue[][] = [
  ['7', '8', '9', '÷'],
  ['4', '5', '6', '×'],
  ['1', '2', '3', '-'],
  ['.', '0', 'back', '+'],
];

/** Applies a key to the expression string, keeping it well-formed (max 2 decimals per operand). */
export function applyKey(expr: string, k: KeyValue): string {
  if (k === 'clear') return '';
  if (k === 'back') return expr.slice(0, -1);
  const ops = '+-×÷';
  const last = expr.slice(-1);
  if (ops.includes(k)) {
    if (expr === '') return k === '-' ? '' : expr;
    if (ops.includes(last)) return expr.slice(0, -1) + k;
    if (last === '.') return expr.slice(0, -1) + k;
    return expr + k;
  }
  const operand = expr.split(/[+\-×÷]/).pop() ?? '';
  if (k === '.') {
    if (operand.includes('.')) return expr;
    return expr + (operand === '' ? '0.' : '.');
  }
  if (operand.includes('.') && operand.split('.')[1].length >= 2) return expr;
  if (operand === '0') return expr.slice(0, -1) + k;
  if (operand.replace('.', '').length >= 11) return expr;
  return expr + k;
}

export function Keypad({ onKey }: { onKey: (k: KeyValue) => void }) {
  const hold = useRef<number>();
  const label = (k: KeyValue) => (k === '-' ? '−' : k);
  return (
    <div className="chrome grid grid-cols-4 gap-[6px] px-2" role="group" aria-label="Keypad">
      {ROWS.flat().map((k) => {
        const isOp = '+-×÷'.includes(k);
        return (
          <button
            key={k}
            type="button"
            aria-label={k === 'back' ? 'Delete' : k === '.' ? 'Decimal point' : k}
            onPointerDown={() => {
              if (k === 'back') hold.current = window.setTimeout(() => onKey('clear'), 550);
            }}
            onPointerUp={() => window.clearTimeout(hold.current)}
            onPointerLeave={() => window.clearTimeout(hold.current)}
            onClick={() => onKey(k)}
            className={`pressable flex h-[50px] items-center justify-center rounded-[12px] text-[26px] ${
              isOp ? 'bg-fill text-accent' : 'bg-surface text-label shadow-[0_1px_0_rgba(0,0,0,0.08)]'
            }`}
          >
            {k === 'back' ? <Delete size={24} strokeWidth={1.8} /> : <span className="rounded-num font-normal">{label(k)}</span>}
          </button>
        );
      })}
    </div>
  );
}
