import { MakaiRPC } from "@mods-manager/services/makai-rpc";
import type { ArchiveInfo } from "@mods/types/install.types";

export async function readArchiveInfo(archivePath: string): Promise<ArchiveInfo> {
  try {
    const result = await MakaiRPC.call<ArchiveInfo>("read_archive", { archive: archivePath });
    return result;
  } catch (err: any) {
    if (err.message?.includes("password_protected")) {
      throw new Error("ARCHIVE_PASSWORD_PROTECTED");
    }
    throw new Error(`readArchiveInfo failed: ${err.message}`);
  }
}
