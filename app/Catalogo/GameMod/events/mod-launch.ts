import { registerEvent } from "@main/events/register-event";
import { scanFixGame } from "@mods/services/scanfix-game";
import { launchGame } from "@mods/services/launch-service";

type SendFn = (step: string, message: string, status: string, promptType?: string) => void;

registerEvent("modScanFixGame", async (event, gameId: string) => {
  const sender = event.sender;
  const send: SendFn = (step, message, status) => {
    sender.send("mod-launch-progress", { step, message, status });
  };

  const scan = await scanFixGame(gameId);
  if (!scan.found) {
    send("step1", "❌ " + (scan.error || "Jogo não encontrado"), "error");
    return { success: false, error: scan.error };
  }
  send("step1", `✅ Jogo encontrado: ${scan.gamePath}`, "done");
  send("done", "✅ ScanFix concluído", "done");
  return { success: true, gamePath: scan.gamePath };
});

registerEvent("modLaunchGame", async (event, gameId: string) => {
  const sender = event.sender;
  const send: SendFn = (step, message, status, promptType) => {
    sender.send("mod-launch-progress", { step, message, status, promptType });
  };

  const result = await launchGame(gameId, (progress) => {
    const stepMap: Record<string, string> = {
      detect: "step1",
      prefix: "step2",
      dll: "step3",
      registry: "step4",
      skse: "step5",
      launch: "step6",
    };
    send(stepMap[progress.step] || progress.step, progress.message, progress.status, progress.promptType);
  });

  return result;
});
