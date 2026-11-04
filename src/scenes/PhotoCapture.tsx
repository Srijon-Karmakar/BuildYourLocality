import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { photoCapture } from '../state/usePhotoStore';

/**
 * Lets the photo mode take a picture of the view. The picture has to be copied out of the 3D canvas in the
 * very frame it is drawn, so a request waits here and is answered on the next frame: the scene is drawn once
 * more and copied at once. (Note: a useFrame with a positive priority would switch off the automatic drawing
 * of the whole scene, so this stays at the normal priority.)
 */
export function PhotoCapture() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const pending = useRef<{ css: string; done: (blob: Blob | null) => void } | null>(null);

  useEffect(() => {
    photoCapture.request = (css) =>
      new Promise((done) => {
        pending.current = { css, done };
      });
    return () => {
      photoCapture.request = null;
    };
  }, []);

  useFrame(() => {
    const job = pending.current;
    if (!job) return;
    pending.current = null;
    const source = gl.domElement;
    gl.render(scene, camera);
    const out = document.createElement('canvas');
    out.width = source.width;
    out.height = source.height;
    const ctx = out.getContext('2d');
    if (!ctx) return job.done(null);
    try {
      ctx.filter = job.css;
      ctx.drawImage(source, 0, 0);
      ctx.filter = 'none';
      // A small mark in the corner.
      const size = Math.max(14, Math.round(out.height / 38));
      ctx.font = `700 ${size}px system-ui, sans-serif`;
      ctx.textAlign = 'right';
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.shadowColor = 'rgba(0,0,0,0.6)';
      ctx.shadowBlur = size * 0.4;
      ctx.fillText('YAT-C', out.width - size, out.height - size);
      out.toBlob((blob) => job.done(blob), 'image/png');
    } catch {
      job.done(null);
    }
  });

  return null;
}
