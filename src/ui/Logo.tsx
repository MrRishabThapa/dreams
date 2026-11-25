/**
 * The official Dreams logo as an iOS-style rounded tile. The logo sits on its own dark
 * backing (part of the icon), so it reads on light backgrounds; a hairline ring keeps
 * the tile's edge visible against true black in dark mode.
 */
export function Logo({ size = 64, className = '', label }: { size?: number; className?: string; label?: string }) {
  return (
    <img
      src="/logo-mark.png"
      width={size}
      height={size}
      alt={label ?? ''}
      aria-hidden={label ? undefined : true}
      draggable={false}
      className={`logo-tile shrink-0 select-none ${className}`}
      style={{ width: size, height: size, borderRadius: size * 0.225 }}
    />
  );
}
