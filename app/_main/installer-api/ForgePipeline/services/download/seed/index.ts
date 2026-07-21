import type { Download } from "@types";
import { resumeSeeding } from "./resume";
import { pauseSeeding } from "./pause";
import { getSeedStatus } from "./status";

export type { Download };

export { resumeSeeding, pauseSeeding, getSeedStatus };

export const seedManager = {
  resume: resumeSeeding,
  pause: pauseSeeding,
  getStatus: getSeedStatus,
};
