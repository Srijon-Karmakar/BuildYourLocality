import { useEffect } from 'react';
import { startSync } from './lib/sync';
import { useAuthStore } from './state/useAuthStore';
import { useGameStore } from './state/useGameStore';
import { Scene } from './scenes/Scene';
import { BuildingInspector } from './ui/BuildingInspector';
import { BuildPalette } from './ui/BuildPalette';
import { CombatHud } from './ui/CombatHud';
import { OrientationGuard } from './ui/OrientationGuard';
import { Crosshair } from './ui/Crosshair';
import { SyncConflictDialog } from './ui/SyncConflictDialog';
import { TopBar } from './ui/TopBar';
import { CameraPad, ConfirmBar, WalkControls } from './ui/TouchControls';
import { useIsTouch } from './ui/useMediaQuery';

function App() {
  const mode = useGameStore((s) => s.mode);
  const touch = useIsTouch();

  // Restore the login session, then keep the city saved and loaded automatically.
  useEffect(() => {
    const stopAuth = useAuthStore.getState().init();
    const stopSync = startSync();
    return () => {
      stopSync();
      stopAuth();
    };
  }, []);

  return (
    <div className="relative h-full w-full overflow-hidden">
      <Scene />
      {mode === 'roam' && !touch && <Crosshair />}
      <TopBar />
      <CombatHud />
      <BuildPalette />
      <BuildingInspector />
      {touch && mode === 'build' && (
        <>
          <CameraPad />
          <ConfirmBar />
        </>
      )}
      {touch && mode === 'roam' && <WalkControls />}
      <SyncConflictDialog />
      <OrientationGuard />
    </div>
  );
}

export default App;
