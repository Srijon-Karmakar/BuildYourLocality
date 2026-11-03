import { useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { viewState, virtualInput, virtualKeys } from '../engine/viewState';
import { useBuilderStore } from '../state/useBuilderStore';
import { combat } from '../sim/combat';
import { Icon } from './icons';
import { useVehicleSnap } from './VehicleHud';
import { vehicle } from '../sim/vehicle';
import { useGameStore } from '../state/useGameStore';
import { useTouchStore } from '../state/useTouchStore';

const pad = 'pointer-events-auto flex touch-none select-none items-center justify-center rounded-full bg-black/45 pointer-coarse:bg-black/69 text-white backdrop-blur-[6px] active:bg-white/30';

const STICK_RADIUS = 40;

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
      className="pointer-events-auto relative h-28 w-28 touch-none select-none rounded-full bg-black/35 pointer-coarse:bg-black/59 backdrop-blur-[6px]"
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
        className="absolute left-1/2 top-1/2 h-9 w-9 rounded-full bg-white/70 shadow-lg"
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
function OnFootControls({ nearCar }: { nearCar: boolean }) {
  const flying = useGameStore((s) => s.flying);
  const toggleFlying = useGameStore((s) => s.toggleFlying);
  const sub = useGameStore((s) => s.roamSubMode);
  const [crouched, setCrouched] = useState(false);
  const [torch, setTorch] = useState(false);
  const fighting = sub !== 'peaceful';

  return (
    <div
      className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between px-5"
      style={{ paddingBottom: 'calc(var(--safe-bottom) + 1.25rem)', paddingLeft: 'calc(var(--safe-left) + 1.25rem)', paddingRight: 'calc(var(--safe-right) + 1.25rem)' }}
    >
      <Joystick />
      {nearCar && (
        <button
          className={`${pad} absolute h-14 w-14 bg-emerald-500/70 text-2xl`}
          style={{ right: 'calc(var(--safe-right) + 9.5rem)', bottom: 'calc(var(--safe-bottom) + 1.25rem)' }}
          onClick={() => vehicle.tryEnter(viewState.x, viewState.z)}
          aria-label="Drive"
        >
          <Icon name="car" />
        </button>
      )}
      {fighting ? (
        <div className="flex items-end gap-3">
          <div className="grid grid-cols-2 gap-2">
            {sub === 'survival' && (
              <button className={`${pad} h-10 w-10 text-xl`} onClick={() => combat.interact()} aria-label="Hide inside a building">
                <Icon name="door" />
              </button>
            )}
            <button
              className={`${pad} h-10 w-10 text-xl ${torch ? 'bg-amber-300/80 text-black' : ''}`}
              onClick={() => {
                combat.player.flashlight = !combat.player.flashlight;
                setTorch(combat.player.flashlight);
              }}
              aria-label="Torch"
            >
              <Icon name="flashlight" />
            </button>
            <button
              className={`${pad} h-10 w-10 text-xl ${crouched ? 'bg-emerald-400/80 text-black' : ''}`}
              onClick={() => {
                virtualInput.crouch = !virtualInput.crouch;
                setCrouched(virtualInput.crouch);
              }}
              aria-label="Crouch"
            >
              <Icon name="person" />
            </button>
            <HoldButton label="Run" className="h-10 w-10 text-xl" onHold={(down) => (virtualInput.sprint = down)}>
              <Icon name="run" />
            </HoldButton>
          </div>
          <div className="flex flex-col items-center gap-3">
            <HoldButton label="Jump" className="h-10 w-10 text-xl" onHold={(down) => (virtualInput.jump = down)}>
              <Icon name="up" />
            </HoldButton>
            <HoldButton label="Attack" className="h-16 w-16 bg-red-600/60 text-3xl" onHold={(down) => (virtualInput.attack = down)}>
              <Icon name="swords" />
            </HoldButton>
          </div>
        </div>
      ) : (
        <div className="flex items-end gap-3">
          <div className="flex flex-col items-center gap-2">
            <button
              className={`${pad} h-10 w-10 text-xl ${torch ? 'bg-amber-300/80 text-black' : ''}`}
              onClick={() => {
                combat.player.flashlight = !combat.player.flashlight;
                setTorch(combat.player.flashlight);
              }}
              aria-label="Torch"
            >
              <Icon name="flashlight" />
            </button>
            <button className={`${pad} h-10 w-10 text-sm ${flying ? 'bg-sky-400/80 text-black' : ''}`} onClick={toggleFlying} aria-label="Toggle flying">
              Fly
            </button>
            {flying ? (
              <HoldButton label="Descend" className="h-10 w-10 text-xl" onHold={(down) => (virtualInput.down = down)}>
                <Icon name="down" />
              </HoldButton>
            ) : (
              <HoldButton label="Run" className="h-10 w-10 text-xl" onHold={(down) => (virtualInput.sprint = down)}>
                <Icon name="run" />
              </HoldButton>
            )}
          </div>
          <HoldButton label={flying ? 'Ascend' : 'Jump'} className="h-16 w-16 text-2xl" onHold={(down) => (virtualInput.jump = down)}>
            <Icon name="up" />
          </HoldButton>
        </div>
      )}
    </div>
  );
}

const cameraKey = (code: string) => (down: boolean) => {
  if (down) virtualKeys.add(code);
  else virtualKeys.delete(code);
};

/** Build mode on a phone: camera buttons as a precise alternative to pinch / twist gestures. */
export function CameraPad() {
  const hand = useBuilderStore((s) => s.hand);
  return (
    <div
      className="pointer-events-none absolute flex flex-col gap-2"
      style={{ right: 'calc(var(--safe-right) + 0.5rem)', top: '50%', transform: 'translateY(-50%)' }}
    >
      <HoldButton label="Zoom in" className="h-9 w-9 text-xl" onHold={cameraKey('ZoomIn')}>
        <Icon name="plus" />
      </HoldButton>
      <HoldButton label="Zoom out" className="h-9 w-9 text-xl" onHold={cameraKey('ZoomOut')}>
        <Icon name="minus" />
      </HoldButton>
      <HoldButton label="Turn left" className="h-9 w-9 text-lg" onHold={cameraKey('KeyQ')}>
        <Icon name="rotateBack" />
      </HoldButton>
      <HoldButton label="Turn right" className="h-9 w-9 text-lg" onHold={cameraKey('KeyE')}>
        <Icon name="rotate" />
      </HoldButton>
      <HoldButton label="Tilt up" className="h-9 w-9 text-base" onHold={cameraKey('TiltUp')}>
        <Icon name="up" />
      </HoldButton>
      <HoldButton label="Tilt down" className="h-9 w-9 text-base" onHold={cameraKey('TiltDown')}>
        <Icon name="down" />
      </HoldButton>
      <button
        aria-label="Hand mode"
        aria-pressed={hand}
        className={`${pad} h-9 w-9 text-base ${hand ? '!bg-white !text-black' : ''}`}
        onClick={() => useBuilderStore.getState().setHand(!hand)}
      >
        <Icon name="hand" />
      </button>
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
      className="pointer-events-auto absolute left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full bg-black/52 pointer-coarse:bg-black/76 p-1.5 text-white shadow-lg backdrop-blur-[6px]"
      style={{ top: 'calc(var(--safe-top) + 4.25rem)' }}
    >
      <button className="h-10 w-10 rounded-full bg-white/15 text-lg active:bg-white/30" onClick={cancel} aria-label="Cancel">
        <Icon name="close" />
      </button>
      {!isRoad && (
        <button className="h-10 w-10 rounded-full bg-white/15 text-lg active:bg-white/30" onClick={rotate} aria-label="Rotate">
          <Icon name="rotate" />
        </button>
      )}
      <button
        className={`h-10 rounded-full px-6 text-base font-semibold transition ${valid ? 'bg-emerald-500 text-black active:bg-emerald-400' : 'bg-white/10 text-white/40'}`}
        disabled={!valid}
        onClick={confirm}
      >
        {valid ? <><Icon name="check" className="mr-1 inline" />Place</> : 'Blocked'}
      </button>
    </div>
  );
}

/** Behind the wheel on a phone: the stick steers and gives gas or brake, buttons for handbrake, horn, view and getting out. */
function DriveControls() {
  const snap = useVehicleSnap();
  return (
    <div
      className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between px-5"
      style={{ paddingBottom: 'calc(var(--safe-bottom) + 4rem)', paddingLeft: 'calc(var(--safe-left) + 1.25rem)', paddingRight: 'calc(var(--safe-right) + 1.25rem)' }}
    >
      <Joystick />
      <div className="flex items-end gap-3">
        <div className="flex flex-col items-center gap-2">
          <button className={`${pad} h-10 w-10 text-xl`} onClick={() => vehicle.exit()} aria-label="Get out">
            <Icon name="exitcar" />
          </button>
          <button className={`${pad} h-10 w-10 text-xl`} onClick={() => (vehicle.view = vehicle.view === 'chase' ? 'hood' : 'chase')} aria-label="Change view">
            <Icon name="view" />
          </button>
          <HoldButton label="Horn" className="h-12 w-12 text-xl" onHold={(down) => (virtualInput.horn = down)}>
            <Icon name="sound" />
          </HoldButton>
        </div>
        <HoldButton label="Handbrake" className={`h-16 w-16 text-3xl ${snap.kmh > 30 ? 'bg-amber-500/60' : ''}`} onHold={(down) => (virtualInput.jump = down)}>
          <Icon name="handbrake" />
        </HoldButton>
      </div>
    </div>
  );
}

/** Walk mode on a phone, or the wheel when driving. */
export function WalkControls() {
  const snap = useVehicleSnap();
  return snap.active ? <DriveControls /> : <OnFootControls nearCar={!!snap.near} />;
}
