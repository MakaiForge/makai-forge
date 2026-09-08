import { registerEvent } from "../register-event";
import { installRunner, getRunnerStatus } from "@emulators/installer";
import { getRunnerById } from "@emulators/registry";

registerEvent("installRunner", async (_event, runnerId: string) => {
  const def = getRunnerById(runnerId);
  if (!def) throw new Error(`Runner não encontrado: ${runnerId}`);
  if (def.isPaid) {
    throw new Error(
      `"${def.humanName}" é um software pago. Adquira em ${def.paidUrl || "o site oficial"} e instale manualmente.`
    );
  }
  if (def.isAbandoned) {
    throw new Error(
      `"${def.humanName}" está abandonado e não pode ser instalado automaticamente. ${def.notes || ""}`
    );
  }
  await installRunner(def);
  return getRunnerStatus(def);
});
