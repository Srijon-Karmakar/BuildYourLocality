import { create } from 'zustand';

/** Start-up progress the loading screen waits for. */
export const useBootStore = create<{ sceneReady: boolean }>(() => ({ sceneReady: false }));
