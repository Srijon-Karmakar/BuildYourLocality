import { useVehicleSnap } from './VehicleHud';

const shadow = { filter: 'drop-shadow(0 0 2px rgba(0,0,0,0.85))' };

/** Where shots go: the middle of the screen. Phones get four arrow heads pointing at it, which stay visible over any background. */
export function Crosshair({ arrows = false }: { arrows?: boolean }) {
  const driving = useVehicleSnap().active;
  if (driving) return null;
  if (arrows) {
    return (
      <svg className="pointer-events-none absolute left-1/2 top-1/2 h-10 w-10 -translate-x-1/2 -translate-y-1/2" viewBox="0 0 40 40" style={shadow} aria-hidden>
        <g fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 5 L20 11 L26 5" />
          <path d="M14 35 L20 29 L26 35" />
          <path d="M5 14 L11 20 L5 26" />
          <path d="M35 14 L29 20 L35 26" />
        </g>
        <circle cx="20" cy="20" r="1.6" fill="rgba(255,80,60,0.95)" />
      </svg>
    );
  }
  return (
    <div className="pointer-events-none absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2">
      <div className="absolute left-1/2 top-1/2 h-0.5 w-4 -translate-x-1/2 -translate-y-1/2 bg-white/80 shadow-[0_0_2px_rgba(0,0,0,0.8)]" />
      <div className="absolute left-1/2 top-1/2 h-4 w-0.5 -translate-x-1/2 -translate-y-1/2 bg-white/80 shadow-[0_0_2px_rgba(0,0,0,0.8)]" />
    </div>
  );
}
