import { useBuilderStore } from '../state/useBuilderStore';
import { WallEditor } from './WallEditor';

/** The wall tool's brush: whatever is set here is what the next walls are built with. */
export function WallSettings() {
  const wall = useBuilderStore((s) => s.wall);
  const setWall = useBuilderStore((s) => s.setWall);
  const applyWallStyle = useBuilderStore((s) => s.applyWallStyle);
  return (
    <div className="flex flex-col gap-3">
      <WallEditor spec={wall} onChange={setWall} onStyle={applyWallStyle} />
      <p className="text-xs text-white/50">
        Click or drag along the grid lines to draw. The wall snaps to the nearest edge; drawing over a wall restyles it. Select a wall later to change just that one.
      </p>
    </div>
  );
}
