// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockLibrary: any[] = [];
const mockElectron = {
  getLibrary: vi.fn().mockResolvedValue(mockLibrary),
  addCustomGameToLibrary: vi.fn().mockResolvedValue(undefined),
  updateGameConfig: vi.fn().mockResolvedValue(undefined),
  deleteGameCompletely: vi.fn().mockResolvedValue(undefined),
  deleteGameWithPrefix: vi.fn().mockResolvedValue(undefined),
};

beforeEach(() => {
  vi.clearAllMocks();
  (window as any).electron = mockElectron;
});

describe("gamesService.generateSlug", () => {
  it("generates slug from name", async () => {
    const { gamesService } = await import("@games-ui/AddGame/games-service");
    expect(gamesService.generateSlug("Half-Life 2")).toBe("half-life-2");
  });

  it("lowercases the name", async () => {
    const { gamesService } = await import("@games-ui/AddGame/games-service");
    expect(gamesService.generateSlug("PORTAL")).toBe("portal");
  });

  it("replaces special characters with hyphens", async () => {
    const { gamesService } = await import("@games-ui/AddGame/games-service");
    expect(gamesService.generateSlug("The Witcher 3: Wild Hunt")).toBe(
      "the-witcher-3-wild-hunt"
    );
  });

  it("removes leading and trailing hyphens", async () => {
    const { gamesService } = await import("@games-ui/AddGame/games-service");
    expect(gamesService.generateSlug("!Half-Life!")).toBe("half-life");
  });

  it("handles empty string", async () => {
    const { gamesService } = await import("@games-ui/AddGame/games-service");
    expect(gamesService.generateSlug("")).toBe("");
  });
});

describe("gamesService.generateId", () => {
  it("returns a string starting with game_", async () => {
    const { gamesService } = await import("@games-ui/AddGame/games-service");
    const id = gamesService.generateId();
    expect(id).toMatch(/^game_/);
  });

  it("returns unique ids on successive calls", async () => {
    const { gamesService } = await import("@games-ui/AddGame/games-service");
    const id1 = gamesService.generateId();
    const id2 = gamesService.generateId();
    expect(id1).not.toBe(id2);
  });
});

describe("gamesService.getAll", () => {
  it("calls window.electron.getLibrary", async () => {
    const { gamesService } = await import("@games-ui/AddGame/games-service");
    await gamesService.getAll();
    expect(mockElectron.getLibrary).toHaveBeenCalledOnce();
  });

  it("returns empty array when getLibrary throws", async () => {
    mockElectron.getLibrary.mockRejectedValueOnce(new Error("fail"));
    const { gamesService } = await import("@games-ui/AddGame/games-service");
    const result = await gamesService.getAll();
    expect(result).toEqual([]);
  });

  it("returns mapped games with defaults", async () => {
    mockElectron.getLibrary.mockResolvedValueOnce([
      {
        objectId: "123",
        shop: "custom",
        title: "Test Game",
        executablePath: "/game.exe",
        isDeleted: undefined,
        favorite: undefined,
      },
    ]);
    const { gamesService } = await import("@games-ui/AddGame/games-service");
    const result = await gamesService.getAll();
    expect(result[0]).toMatchObject({
      objectId: "123",
      shop: "custom",
      title: "Test Game",
      isDeleted: false,
      favorite: false,
      runner: "proton",
      slug: "test-game",
    });
  });

  it("preserves runner when backend returns wine", async () => {
    mockElectron.getLibrary.mockResolvedValueOnce([
      {
        objectId: "456",
        shop: "custom",
        title: "Wine Game",
        runner: "wine",
      },
    ]);
    const { gamesService } = await import("@games-ui/AddGame/games-service");
    const result = await gamesService.getAll();
    expect(result[0].runner).toBe("wine");
  });

  it("falls back to proton for unknown runner values", async () => {
    mockElectron.getLibrary.mockResolvedValueOnce([
      {
        objectId: "789",
        shop: "custom",
        title: "Unknown Runner",
        runner: "dosbox",
      },
    ]);
    const { gamesService } = await import("@games-ui/AddGame/games-service");
    const result = await gamesService.getAll();
    expect(result[0].runner).toBe("proton");
  });
});

describe("gamesService.getById", () => {
  it("returns the game matching the given objectId", async () => {
    mockElectron.getLibrary.mockResolvedValueOnce([
      { objectId: "a", shop: "custom", title: "Game A" },
      { objectId: "b", shop: "custom", title: "Game B" },
    ]);
    const { gamesService } = await import("@games-ui/AddGame/games-service");
    const result = await gamesService.getById("b");
    expect(result?.title).toBe("Game B");
  });

  it("returns null when no match is found", async () => {
    mockElectron.getLibrary.mockResolvedValueOnce([
      { objectId: "a", shop: "custom", title: "Game A" },
    ]);
    const { gamesService } = await import("@games-ui/AddGame/games-service");
    const result = await gamesService.getById("nonexistent");
    expect(result).toBeNull();
  });
});

describe("gamesService.delete", () => {
  it("calls deleteGameCompletely with shop and objectId", async () => {
    const { gamesService } = await import("@games-ui/AddGame/games-service");
    await gamesService.delete("custom", "obj_1");
    expect(mockElectron.deleteGameCompletely).toHaveBeenCalledWith("custom", "obj_1");
  });
});

describe("gamesService.deleteWithPrefix", () => {
  it("calls deleteGameWithPrefix with shop and objectId", async () => {
    const { gamesService } = await import("@games-ui/AddGame/games-service");
    await gamesService.deleteWithPrefix("steam", "steam_123");
    expect(mockElectron.deleteGameWithPrefix).toHaveBeenCalledWith("steam", "steam_123");
  });
});

describe("gamesService.save", () => {
  it("calls addCustomGameToLibrary with correct args", async () => {
    const { gamesService } = await import("@games-ui/AddGame/games-service");
    await gamesService.save({
      objectId: "",
      shop: "custom",
      title: "New Game",
      slug: "new-game",
      runner: "proton",
      isDeleted: false,
      favorite: false,
      playTimeInMilliseconds: 0,
      lastTimePlayed: null,
      executablePath: "/game.exe",
      iconUrl: "/icon.png",
      logoImageUrl: "/logo.png",
      libraryHeroImageUrl: "/hero.png",
    });
    expect(mockElectron.addCustomGameToLibrary).toHaveBeenCalledWith(
      "New Game",
      "/game.exe",
      "/icon.png",
      "/logo.png",
      "/hero.png"
    );
  });
});

describe("gamesService.update", () => {
  it("calls updateGameConfig with mapped fields", async () => {
    const { gamesService } = await import("@games-ui/AddGame/games-service");
    await gamesService.update({
      objectId: "obj_1",
      shop: "custom",
      title: "Game",
      slug: "game",
      runner: "proton",
      isDeleted: false,
      favorite: false,
      playTimeInMilliseconds: 0,
      lastTimePlayed: null,
      winePrefixPath: "/prefix",
      prefix: "/prefix",
    });
    expect(mockElectron.updateGameConfig).toHaveBeenCalledWith(
      "custom",
      "obj_1",
      expect.objectContaining({
        prefix: "/prefix",
        winePrefixPath: "/prefix",
      })
    );
  });
});
