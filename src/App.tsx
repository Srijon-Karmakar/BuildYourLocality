import { useGameStore } from './state/useGameStore';
import { Scene } from './scenes/Scene';
import { BuildingInspector } from './ui/BuildingInspector';
import { BuildPalette } from './ui/BuildPalette';
import { Crosshair } from './ui/Crosshair';
import { TopBar } from './ui/TopBar';
import { CameraPad, ConfirmBar, WalkControls } from './ui/TouchControls';
import { useIsTouch } from './ui/useMediaQuery';

function App() {
  const mode = useGameStore((s) => s.mode);
  const touch = useIsTouch();

  return (
    <div className="relative h-full w-full overflow-hidden">
      <Scene />
      {mode === 'roam' && !touch && <Crosshair />}
      <TopBar />
      <BuildPalette />
      <BuildingInspector />
      {touch && mode === 'build' && (
        <>
          <CameraPad />
          <ConfirmBar />
        </>
      )}
      {touch && mode === 'roam' && <WalkControls />}
    </div>
  );
}

export default App;
