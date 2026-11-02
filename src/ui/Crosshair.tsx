import { useVehicleSnap } from './VehicleHud';

export function Crosshair() {
  const driving = useVehicleSnap().active;
  if (driving) return null;
  return (
    <div className="pointer-events-none absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2">
      <div className="absolute left-1/2 top-1/2 h-0.5 w-4 -translate-x-1/2 -translate-y-1/2 bg-white/80 shadow-[0_0_2px_rgba(0,0,0,0.8)]" />
      <div className="absolute left-1/2 top-1/2 h-4 w-0.5 -translate-x-1/2 -translate-y-1/2 bg-white/80 shadow-[0_0_2px_rgba(0,0,0,0.8)]" />
    </div>
  );
}
