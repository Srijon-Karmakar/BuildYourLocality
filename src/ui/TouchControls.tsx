import { useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { virtualInput, virtualKeys } from '../engine/viewState';
import { useBuilderStore } from '../state/useBuilderStore';
import { useGameStore } from '../state/useGameStore';
import { useTouchStore } from '../state/useTouchStore';

const pad = 'pointer-events-auto flex touch-none select-none items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-md active:bg-white/30';

const STICK_RADIUS = 52;

/** Floating thumb-stick that drives walking / flying. */
function Joystick() {
  const origin = useRef<{ x: number; y: number; id: number } | null>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });

  const update = (e: ReactPointerEvent) => {
    if (!origin.current) return;
    let dx = e.clientX - origin.current.x;
    let dy = e.clientY - origin.current.y;
    const len = Math.hypot(dx, dy);
    if (len > STICK_RADIUS) {
      dx = (dx / len) * STICK_RADIUS;
      dy = (dy / len) * STICK_RADIUS;
    }
    setKnob({ x: dx, y: dy });
    virtualInput.moveX = dx / STICK_RADIUS;
    virtualInput.moveY = -dy / STICK_RADIUS;
  };
  const release = () => {
    origin.current = null;
    setKnob({ x: 0, y: 0 });
    virtualInput.moveX = 0;
    virtualInput.moveY = 0;
  };

  return (
    <div
      className="pointer-events-auto relative h-36 w-36 touch-none select-none rounded-full bg-black/35 backdrop-blur-md"
      onPointerDown={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        origin.current = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, id: e.pointerId };
        e.currentTarget.setPointerCapture(e.pointerId);
        update(e);
      }}
      onPointerMove={update}
      onPointerUp={release}
      onPointerCancel={release}
    >
      <div
        className="absolute left-1/2 top-1/2 h-14 w-14 rounded-full bg-white/70 shadow-lg"
        style={{ transform: `translate(calc(-50% + ${knob.x}px), calc(-50% + ${knob.y}px))` }}
      />
    </div>
  );
}

/** A button that stays "pressed" while a finger is on it. */
function HoldButton({ onHold, children, className = '', label }: { onHold: (down: boolean) => void; children: ReactNode; className?: string; label: string }) {
  return (
    <button
      aria-label={label}
      className={`${pad} ${className}`}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        onHold(true);
      }}
      onPointerUp={() => onHold(false)}
      onPointerCancel={() => onHold(false)}
    >
      {children}
    </button>
  );
}

/** Walk mode on a phone: joystick on the left, jump / fly buttons on the right. Looking is drag-anywhere. */
export function WalkControls() {
  const flying = useGameStore((s) => s.flying);
  const toggleFlying = useGameStore((s) => s.toggleFlying);

  return (
    <div
      className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between px-5"
      style={{ paddingBottom: 'calc(var(--safe-bottom) + 1.25rem)', paddingLeft: 'calc(var(--safe-left) + 1.25rem)', paddingRight: 'calc(var(--safe-right) + 1.25rem)' }}
    >
      <Joystick />
      <div className="flex flex-col items-center gap-3">
        <button
          className={`${pad} h-12 w-12 text-sm ${flying ? 'bg-sky-400/80 text-black' : ''}`}
          onClick={toggleFlying}
          aria-label="Toggle flying"
        >
          Fly
        </button>
        {flying && (
          <HoldButton label="Descend" className="h-14 w-14 text-xl" onHold={(down) => (virtualInput.down = down)}>
            ▼
          </HoldButton>
        )}
        <HoldButton label={flying ? 'Ascend' : 'Jump'} className="h-20 w-20 text-2xl" onHold={(down) => (virtualInput.jump = down)}>
          {flying ? '▲' : '⤒'}
        </HoldButton>
      </div>
    </div>
  );
}

const cameraKey = (code: string) => (down: boolean) => {
  if (down) virtualKeys.add(code);
  else virtualKeys.delete(code);
};

/** Build mode on a phone: camera buttons as a precise alternative to pinch / twist gestures. */
export function CameraPad() {
  return (
    <div
      className="pointer-events-none absolute flex flex-col gap-2"
      style={{ right: 'calc(var(--safe-right) + 0.5rem)', top: '50%', transform: 'translateY(-50%)' }}
    >
      <HoldButton label="Zoom in" className="h-11 w-11 text-xl" onHold={cameraKey('ZoomIn')}>
        ＋
      </HoldButton>
      <HoldButton label="Zoom out" className="h-11 w-11 text-xl" onHold={cameraKey('ZoomOut')}>
        －
      </HoldButton>
      <HoldButton label="Turn left" className="h-11 w-11 text-lg" onHold={cameraKey('KeyQ')}>
        ⟲
      </HoldButton>
      <HoldButton label="Turn right" className="h-11 w-11 text-lg" onHold={cameraKey('KeyE')}>
        ⟳
      </HoldButton>
      <HoldButton label="Tilt up" className="h-11 w-11 text-base" onHold={cameraKey('TiltUp')}>
        ⤒
      </HoldButton>
      <HoldButton label="Tilt down" className="h-11 w-11 text-base" onHold={cameraKey('TiltDown')}>
        ⤓
      </HoldButton>
    </div>
  );
}

/** Appears after a tap on the map: confirm, rotate, or cancel the pending placement. */
export function ConfirmBar() {
  const pending = useTouchStore((s) => s.pending);
  const valid = useTouchStore((s) => s.valid);
  const confirm = useTouchStore((s) => s.confirm);
  const cancel = useTouchStore((s) => s.cancel);
  const rotate = useBuilderStore((s) => s.rotate);
  const tool = useBuilderStore((s) => s.tool);

  if (!pending) return null;
  const isRoad = tool === 'road';

  return (
    <div
      className="pointer-events-auto absolute left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full bg-black/70 p-1.5 text-white shadow-lg backdrop-blur-md"
      style={{ top: 'calc(var(--safe-top) + 4.25rem)' }}
    >
      <button className="h-12 w-12 rounded-full bg-white/15 text-lg active:bg-white/30" onClick={cancel} aria-label="Cancel">
        ✕
      </button>
      {!isRoad && (
        <button className="h-12 w-12 rounded-full bg-white/15 text-lg active:bg-white/30" onClick={rotate} aria-label="Rotate">
          ↻
        </button>
      )}
      <button
        className={`h-12 rounded-full px-6 text-base font-semibold transition ${valid ? 'bg-emerald-500 text-black active:bg-emerald-400' : 'bg-white/10 text-white/40'}`}
        disabled={!valid}
        onClick={confirm}
      >
        {valid ? '✓ Place' : 'Blocked'}
      </button>
    </div>
  );
}
