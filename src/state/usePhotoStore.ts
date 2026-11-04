import { create } from 'zustand';

export type PhotoFilter = 'none' | 'vivid' | 'warm' | 'cool' | 'noir' | 'sepia' | 'fade';

/** CSS filter strings, used live on the view and again when the picture is saved. */
export const PHOTO_FILTERS: { id: PhotoFilter; label: string; css: string }[] = [
  { id: 'none', label: 'Natural', css: 'none' },
  { id: 'vivid', label: 'Vivid', css: 'saturate(1.45) contrast(1.1)' },
  { id: 'warm', label: 'Warm', css: 'sepia(0.28) saturate(1.25) hue-rotate(-8deg)' },
  { id: 'cool', label: 'Cool', css: 'saturate(1.1) hue-rotate(12deg) brightness(1.03)' },
  { id: 'noir', label: 'Noir', css: 'grayscale(1) contrast(1.25)' },
  { id: 'sepia', label: 'Sepia', css: 'sepia(0.85) contrast(1.05)' },
  { id: 'fade', label: 'Fade', css: 'contrast(0.88) saturate(0.8) brightness(1.08)' },
];

interface PhotoState {
  active: boolean;
  filter: PhotoFilter;
  /** Set while the picture is being taken. */
  busy: boolean;
  setActive: (active: boolean) => void;
  setFilter: (filter: PhotoFilter) => void;
}

export const usePhotoStore = create<PhotoState>((set) => ({
  active: false,
  filter: 'none',
  busy: false,
  setActive: (active) => {
    // The mouse is captured while walking: give it back so the photo controls can be used.
    if (active && typeof document !== 'undefined' && document.pointerLockElement) document.exitPointerLock();
    set({ active });
  },
  setFilter: (filter) => set({ filter }),
}));

/** Filled in by the 3D scene: takes the picture on the next frame and hands back the image. */
export const photoCapture: { request: ((filterCss: string) => Promise<Blob | null>) | null } = { request: null };
