import { useState } from 'react';

type Row = [keys: string, does: string];

const BUILD: Row[] = [
  ['W A S D / arrows', 'Pan the view (hold Shift to go faster)'],
  ['Middle-drag', 'Pan with the mouse'],
  ['H', 'Hand mode: left-drag pans'],
  ['Right-drag', 'Rotate and tilt (3D orbit)'],
  ['Q / Z or E', 'Turn the view left / right'],
  ['Mouse wheel', 'Zoom'],
  ['Click', 'Place'],
  ['R', 'Rotate the piece being placed'],
  ['Del / Backspace / X', 'Delete (X: always what is under the cursor)'],
  ['E', 'Edit / select tool'],
  ['Ctrl+Z', 'Undo'],
  ['Esc', 'Cancel or deselect'],
  ['Tab', 'Switch to walk mode'],
];

const WALK: Row[] = [
  ['W A S D / arrows', 'Move'],
  ['Mouse', 'Look (click the view first to capture the mouse)'],
  ['Space', 'Jump'],
  ['Shift', 'Run (descend when flying)'],
  ['F', 'Fly mode on / off'],
  ['Ctrl or C', 'Crouch (survival)'],
  ['L', 'Torch'],
  ['E', 'Hide in a nearby building'],
  ['1-9, 0, -', 'Switch weapons'],
  ['Tab', 'Back to build mode'],
];

const TOUCH: Row[] = [
  ['One finger', 'Pan (build mode)'],
  ['Two fingers', 'Pan, pinch to zoom, twist to rotate'],
  ['Joystick and buttons', 'Move and act in walk mode'],
];

function Table({ title, rows }: { title: string; rows: Row[] }) {
  return (
    <div>
      <div className="mb-1 text-white/60">{title}</div>
      <ul className="flex flex-col gap-1">
        {rows.map(([keys, does]) => (
          <li key={keys} className="flex items-baseline justify-between gap-3">
            <span className="shrink-0 rounded bg-white/12 px-1.5 py-0.5 font-mono text-[11px] text-white">{keys}</span>
            <span className="text-right text-white/75">{does}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The keyboard, mouse and touch controls, as a collapsible list in the settings. */
export function ControlsHelp() {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col gap-3">
      <button onClick={() => setOpen((v) => !v)} className="flex min-h-9 items-center justify-between text-white/70 sm:min-h-0" aria-expanded={open}>
        Controls
        <span className={`transition ${open ? 'rotate-180' : ''}`}>⌄</span>
      </button>
      {open && (
        <div className="flex flex-col gap-3 border-t border-white/10 pt-3">
          <Table title="Build mode" rows={BUILD} />
          <Table title="Walk mode" rows={WALK} />
          <Table title="Touch screens" rows={TOUCH} />
        </div>
      )}
    </div>
  );
}
