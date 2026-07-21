export class ProtonDebridClient {
  public static async getAvailableMagnets(
    _magnets: string[]
  ): Promise<Record<string, boolean> | null> {
    return null;
  }

  public static async getDownloadUrl(_magnet: string) {
    return null;
  }
}
