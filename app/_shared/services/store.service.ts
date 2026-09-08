class StoreService {
  get(
    key: string,
    sublevelName?: string | null,
    valueEncoding?: "json" | "utf8"
  ): Promise<unknown> {
    return window.electron.store.get(key, sublevelName, valueEncoding);
  }

  put(
    key: string,
    value: unknown,
    sublevelName?: string | null,
    valueEncoding?: "json" | "utf8"
  ): Promise<void> {
    return window.electron.store.put(key, value, sublevelName, valueEncoding);
  }

  del(key: string, sublevelName?: string | null): Promise<void> {
    return window.electron.store.del(key, sublevelName);
  }

  clear(sublevelName: string): Promise<void> {
    return window.electron.store.clear(sublevelName);
  }

  values(sublevelName: string): Promise<unknown[]> {
    return window.electron.store.values(sublevelName);
  }

  iterator(sublevelName: string): Promise<[string, unknown][]> {
    return window.electron.store.iterator(sublevelName);
  }
}

export const storeService = new StoreService();
