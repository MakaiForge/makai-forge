import { createSlice } from "@reduxjs/toolkit";
import type { PayloadAction } from "@reduxjs/toolkit";

export interface RunnerEntry {
  id: string;
  humanName: string;
  isInstalled: boolean;
  installedVersion?: string;
}

export interface RunnersState {
  installed: RunnerEntry[];
  icons: Record<string, string | null>;
}

const initialState: RunnersState = {
  installed: [],
  icons: {},
};

export const runnersSlice = createSlice({
  name: "runners",
  initialState,
  reducers: {
    setInstalledRunners: (state, action: PayloadAction<RunnerEntry[]>) => {
      state.installed = action.payload;
    },
    setRunnerIcon: (
      state,
      action: PayloadAction<{ id: string; dataUrl: string | null }>
    ) => {
      state.icons[action.payload.id] = action.payload.dataUrl;
    },
    setRunnerIcons: (
      state,
      action: PayloadAction<Record<string, string | null>>
    ) => {
      state.icons = action.payload;
    },
  },
});

export const { setInstalledRunners, setRunnerIcon, setRunnerIcons } =
  runnersSlice.actions;
