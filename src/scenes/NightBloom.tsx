import { useFrame } from '@react-three/fiber';
import { Bloom, EffectComposer, ToneMapping } from '@react-three/postprocessing';
import { ToneMappingMode, type BloomEffect } from 'postprocessing';
import { useRef, useState } from 'react';
import { useGameStore } from '../state/useGameStore';
import { atmo } from './atmosphere';
import { useIsTouch } from '../ui/useMediaQuery';

const BLOOM_INTENSITY = 1.15;

/**
 * Soft glow around anything brighter than the screen can show: lit windows, shop signs, lamp
 * bulbs, LED screens, headlamps, stars. Only mounted after dark (the post-processing chain has a
 * cost, and by day nothing is bright enough to bloom), and fades in with the dusk.
 */
export function NightBloom() {
  const enabled = useGameStore((s) => s.graphics.bloom);
  const preset = useGameStore((s) => s.graphics.preset);
  const touch = useIsTouch();
  const [night, setNight] = useState(false);
  const bloom = useRef<BloomEffect>(null);

  useFrame(() => {
    // Hysteresis so the chain does not flip on and off around dusk.
    const want = atmo.lamps > (night ? 0.03 : 0.08);
    if (want !== night) setNight(want);
    if (bloom.current) bloom.current.intensity = BLOOM_INTENSITY * Math.min(1, atmo.lamps * 1.3);
  });

  if (touch || !enabled || !night) return null;
  const light = preset === 'low' || touch;
  return (
    <EffectComposer multisampling={light ? 0 : 4}>
      <Bloom
        ref={bloom}
        intensity={BLOOM_INTENSITY}
        luminanceThreshold={0.85}
        luminanceSmoothing={0.25}
        mipmapBlur
        radius={light ? 0.6 : 0.78}
        resolutionScale={light ? 0.5 : 1}
      />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
    </EffectComposer>
  );
}
