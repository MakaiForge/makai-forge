import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockFetch = vi.fn();
global.fetch = mockFetch;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("fetchLutrisCover", () => {
  it("returns cover URL when exact slug match is found", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve([
          { slug: "half-life-2", name: "Half-Life 2", coverart: "/games/123/cover.png" },
        ]),
    });

    const { fetchLutrisCover } = await import("./cover-service");
    const result = await fetchLutrisCover("Half-Life 2");

    expect(result.success).toBe(true);
    expect(result.coverUrl).toBe("https://lutris.net/games/123/cover.png");
    expect(result.source).toBe("lutris");
  });

  it("returns error when API is unavailable", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false });
    const { fetchLutrisCover } = await import("./cover-service");
    const result = await fetchLutrisCover("Unknown Game");
    expect(result.success).toBe(false);
    expect(result.error).toBe("API unavailable");
  });

  it("returns error when no games found", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([]),
    });
    const { fetchLutrisCover } = await import("./cover-service");
    const result = await fetchLutrisCover("NONEXISTENT_GAME_XYZ");
    expect(result.success).toBe(false);
    expect(result.error).toBe("Game not found");
  });
});

describe("fetchSteamGridCover", () => {
  it("returns cover URL when app is found", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve([{ appid: "220", name: "Half-Life 2", logo: true }]),
    });
    const { fetchSteamGridCover } = await import("./cover-service");
    const result = await fetchSteamGridCover("Half-Life 2");
    expect(result.success).toBe(true);
    expect(result.coverUrl).toBe(
      "https://steamcdn-a.akamaihd.net/steam/apps/220/header.jpg"
    );
    expect(result.source).toBe("steam");
  });

  it("returns error when search fails", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false });
    const { fetchSteamGridCover } = await import("./cover-service");
    const result = await fetchSteamGridCover("Unknown Game");
    expect(result.success).toBe(false);
    expect(result.error).toBe("Steam search failed");
  });
});

describe("searchGameCover", () => {
  it("returns Lutris result first when available", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve([{ slug: "game", name: "Game", coverart: "/c.png" }]),
    });
    const { searchGameCover } = await import("./cover-resolver");
    const result = await searchGameCover("Game");
    expect(result.source).toBe("lutris");
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("falls back to Steam when Lutris fails", async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([{ appid: "123", name: "Game", logo: true }]),
      });
    const { searchGameCover } = await import("./cover-resolver");
    const result = await searchGameCover("Game");
    expect(result.source).toBe("steam");
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("returns error when both sources fail", async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({ ok: false });
    const { searchGameCover } = await import("./cover-resolver");
    const result = await searchGameCover("Game");
    expect(result.success).toBe(false);
    expect(result.error).toBe("No cover found in any source");
  });

  it("falls back to first result when no exact match in Lutris", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve([
          { slug: "different-game", name: "Different Game", coverart: "/games/456/cover.png" },
        ]),
    });
    const { fetchLutrisCover } = await import("./cover-service");
    const result = await fetchLutrisCover("My Game");
    expect(result.success).toBe(true);
    expect(result.coverUrl).toBe("https://lutris.net/games/456/cover.png");
  });

  it("returns error on network exception in fetchLutrisCover", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network error"));
    const { fetchLutrisCover } = await import("./cover-service");
    const result = await fetchLutrisCover("Game");
    expect(result.success).toBe(false);
    expect(result.error).toBe("Network error");
  });

  it("returns error on network exception in fetchSteamGridCover", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Timeout"));
    const { fetchSteamGridCover } = await import("./cover-service");
    const result = await fetchSteamGridCover("Game");
    expect(result.success).toBe(false);
    expect(result.error).toBe("Timeout");
  });

  it("returns error when no coverart exists on Lutris result", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve([{ slug: "game", name: "Game" }]),
    });
    const { fetchLutrisCover } = await import("./cover-service");
    const result = await fetchLutrisCover("Game");
    expect(result.success).toBe(false);
    expect(result.error).toBe("No cover found");
  });

  it("returns error when apps list is empty in Steam search", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([]),
    });
    const { fetchSteamGridCover } = await import("./cover-service");
    const result = await fetchSteamGridCover("Game");
    expect(result.success).toBe(false);
    expect(result.error).toBe("Game not found");
  });

  it("returns error when Steam app has no logo", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([{ appid: "123", name: "Game" }]),
    });
    const { fetchSteamGridCover } = await import("./cover-service");
    const result = await fetchSteamGridCover("Game");
    expect(result.success).toBe(false);
    expect(result.error).toBe("No cover found");
  });
});
