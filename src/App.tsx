import { lazy, Suspense, useEffect } from 'react';
import { joinWithCode, requestJoin, startSync } from './lib/sync';
import { useWorldsStore } from './state/useWorldsStore';
import { useMenuStore } from './state/useMenuStore';
import { startWallet } from './lib/wallet';
import { initAds } from './lib/rewardedAd';
import { useAuthStore } from './state/useAuthStore';
import { useGameStore } from './state/useGameStore';
// The 3D scene (three.js and the physics engine) is the bulk of the download: it loads while the loading screen is up.
const Scene = lazy(() => import('./scenes/Scene').then((m) => ({ default: m.Scene })));
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

  // Invite links: ?join=CODE joins a friend's world, ?world=ID asks the owner to let you in.
  const signedIn = useAuthStore((s) => !!s.session);
  useEffect(() => {
    if (!signedIn) return;
    const params = new URLSearchParams(window.location.search);
    const code = params.get('join');
    const world = params.get('world');
    if (!code && !world) return;
    window.history.replaceState(null, '', window.location.pathname);
    useMenuStore.getState().select('worlds');
    if (code) void joinWithCode(code).then((err) => useWorldsStore.setState({ error: err }));
    else if (world) void requestJoin(world).then((r) => useWorldsStore.setState({ error: r.message }));
  }, [signedIn]);

  return (
    <div className="relative h-full w-full overflow-hidden">
      <Suspense fallback={null}>
        <Scene />
      </Suspense>
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
