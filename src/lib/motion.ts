import { useReducedMotion, type Transition } from 'framer-motion';

export const SHEET_SPRING: Transition = { type: 'spring', stiffness: 380, damping: 34, mass: 1 };
export const SNAPPY: Transition = { type: 'spring', stiffness: 500, damping: 38 };
export const FADE: Transition = { duration: 0.12, ease: 'easeOut' };

/** Returns the spring, or a 120 ms fade when the user prefers reduced motion. */
export function useSpring(t: Transition = SHEET_SPRING): Transition {
  const reduce = useReducedMotion();
  return reduce ? FADE : t;
}
