/** The preload bridge (src/preload): the renderer's only way to reach files, processes, and keys. */
import type { StudioApi } from "../../shared/api";

declare global {
  interface Window {
    himawari: StudioApi;
  }
}

export const studio: StudioApi = window.himawari;
