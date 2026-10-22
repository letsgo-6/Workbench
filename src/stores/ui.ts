import { create } from 'zustand';
export const useUi = create<{
  palette: boolean;
  setPalette: (open: boolean) => void;
  selection: string[];
  setSelection: (ids: string[]) => void;
}>((set) => ({
  palette: false,
  setPalette: (palette) => set({ palette }),
  selection: [],
  setSelection: (selection) => set({ selection }),
}));
