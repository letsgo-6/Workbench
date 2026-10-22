import { create } from 'zustand';
// Keep unsaved input across route unmounts without persisting private text to disk.
export const useCaptureDraft = create<{
  value: string;
  setValue: (value: string) => void;
}>((set) => ({
  value: '',
  setValue: (value) => set({ value }),
}));
