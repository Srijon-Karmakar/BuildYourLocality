import { useGameStore } from './state/useGameStore';
import { Scene } from './scenes/Scene';
import { AccountPanel } from './ui/AccountPanel';
import { BuildingInspector } from './ui/BuildingInspector';
import { BuildPalette } from './ui/BuildPalette';
import { Crosshair } from './ui/Crosshair';
import { ModeBar } from './ui/ModeBar';
import { SettingsPanel } from './ui/SettingsPanel';

function App() {
  const mode = useGameStore((s) => s.mode);
  return (
    <div className="relative h-full w-full">
      <Scene />
      {mode === 'roam' && <Crosshair />}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-4">
        <ModeBar />
        <div className="flex items-start gap-2">
          <AccountPanel />
          <SettingsPanel />
        </div>
      </div>
      <BuildPalette />
      <BuildingInspector />
    </div>
  );
}

export default App;
