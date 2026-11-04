import { useState } from 'react';
import { useBlueprintStore } from '../state/useBlueprintStore';
import { useBuilderStore } from '../state/useBuilderStore';

const chip = (on: boolean) => `rounded-md px-2 py-1.5 text-xs transition sm:py-1 ${on ? 'bg-white text-black' : 'bg-white/10 text-white/80 active:bg-white/20 sm:hover:bg-white/20'}`;

/**
 * Blueprints: save the pieces you have selected, stamp them anywhere with one click, and share them
 * as a short text code that anyone can paste in.
 */
export function BlueprintPanel() {
  const items = useBlueprintStore((s) => s.items);
  const activeId = useBlueprintStore((s) => s.activeId);
  const selected = useBuilderStore((s) => s.selectedIds);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const store = useBlueprintStore.getState();

  const copy = async (id: string) => {
    const text = store.exportCode(id);
    if (!text) return setNote('Could not make a code for that one.');
    try {
      await navigator.clipboard.writeText(text);
      setNote('Code copied. Send it to a friend; they paste it under "Import".');
    } catch {
      setCode(text);
      setNote('Copy it from the box below.');
    }
  };

  return (
    <div className="flex flex-col gap-2.5 text-xs text-white">
      <div className="rounded-lg bg-white/8 p-2">
        <div className="mb-1.5 text-white/65">Save the {selected.length} selected piece{selected.length === 1 ? '' : 's'}</div>
        <div className="flex gap-1.5">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" maxLength={40} className="min-w-0 flex-1 rounded-md bg-black/30 px-2 py-1.5 text-white placeholder:text-white/35" />
          <button
            className="rounded-md bg-white px-3 py-1.5 font-semibold text-black active:bg-white/80 disabled:opacity-40"
            disabled={selected.length === 0}
            onClick={() => {
              const error = store.saveFrom(selected, name);
              setNote(error ?? 'Saved. Pick it below, then click the map to place it.');
              if (!error) setName('');
            }}
          >
            Save
          </button>
        </div>
        <p className="mt-1.5 text-[11px] leading-snug text-white/45">Use the Edit tool: click a piece, or drag a box over several, then save.</p>
      </div>

      {items.length === 0 ? (
        <p className="text-white/50">No blueprints yet.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {items.map((b) => (
            <li key={b.id} className={`rounded-lg p-2 ${activeId === b.id ? 'bg-white/20' : 'bg-white/8'}`}>
              <button className="w-full text-left" onClick={() => store.activate(b.id)}>
                <span className="font-medium">{b.name}</span>
                <span className="ml-2 text-white/50">
                  {b.pieces.length} pieces · {b.w}×{b.d}
                </span>
              </button>
              <div className="mt-1.5 flex gap-1.5">
                <button className={chip(activeId === b.id)} onClick={() => store.activate(b.id)}>
                  {activeId === b.id ? 'Placing' : 'Place'}
                </button>
                <button className={chip(false)} onClick={() => void copy(b.id)}>
                  Copy code
                </button>
                <button className={chip(false) + ' !text-red-300'} onClick={() => store.remove(b.id)}>
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="rounded-lg bg-white/8 p-2">
        <div className="mb-1.5 text-white/65">Import a blueprint code</div>
        <textarea value={code} onChange={(e) => setCode(e.target.value)} placeholder="YATC1:..." rows={2} className="w-full resize-none rounded-md bg-black/30 px-2 py-1.5 text-[11px] text-white placeholder:text-white/35" />
        <button
          className={chip(false) + ' mt-1.5'}
          disabled={!code.trim()}
          onClick={() => {
            const error = store.importCode(code);
            setNote(error ?? 'Imported. Click the map to place it.');
            if (!error) setCode('');
          }}
        >
          Import
        </button>
      </div>

      {note && <p className="text-[11px] text-amber-300">{note}</p>}
      <p className="text-[11px] leading-snug text-white/45">Click the map (or tap twice on a phone) to stamp the chosen blueprint. Spots that are blocked are skipped. One undo removes it all.</p>
    </div>
  );
}
