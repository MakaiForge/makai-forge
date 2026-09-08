import { RunnerDefinition } from "../../types";

export const tic80: RunnerDefinition = {
  id: "tic80",
  humanName: "TIC-80",
  description: "Computador fantasy gratuito para criação de jogos (substituto do PICO-8)",
  category: "obscure",
  platforms: ["TIC-80"],
  downloadUrl: "https://github.com/nesbox/TIC-80/releases/download/v1.1.2837/tic80-v1.1-linux.deb",
  executablePath: "tic80",
  launchArgs: (romPath) => [romPath],
  romSites: [
    { name: "itch.io", url: "https://itch.io/games/tag-tic-80" },
    { name: "TIC-80 BBS", url: "https://tic80.com/play" },
  ],
};
