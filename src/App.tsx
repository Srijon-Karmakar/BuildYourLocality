import { useEffect } from 'react';
import { startSync } from './lib/sync';
import { startWallet } from './lib/wallet';
import { initAds } from './lib/rewardedAd';
import { useAuthStore } from './state/useAuthStore';
import { useGameStore } from './state/useGameStore';
import { Scene } from './scenes/Scene';
import { BuildingInspector } from './ui/BuildingInspector';
import { BuildPalette } from './ui/BuildPalette';
import { CurtainLoader } from './ui/CurtainLoader';
import { CombatHud } from './ui/CombatHud';
import { VehicleHud } from './ui/VehicleHud';
import { Crosshair } from './ui/Crosshair';
import { SyncConflictDialog } from './ui/SyncConflictDialog';
import { SampleAdOverlay } from './ui/SampleAdOverlay';
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
    const stopWallet = startWallet();
    initAds();
    return () => {
      stopSync();
      stopWallet();
      stopAuth();
    };
  }, []);

  return (
    <div className="relative h-full w-full overflow-hidden">
      <Scene />
      {mode === 'roam' && !touch && <Crosshair />}
      <TopBar />
      <CombatHud />
      <VehicleHud />
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
      <SampleAdOverlay />
      <CurtainLoader />
    </div>
  );
}

export default App;
