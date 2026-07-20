/**
 * Storage Keys — Chaves de armazenamento para ModStorageService.
 *
 * Funções puras para gerar chaves consistentes.
 */

/** Chave de inventário de um mod */
export const mkInvKey = (gameId: string, modName: string) =>
  `game:${gameId}:mod:${modName}:inventory`;

/** Chave de modlist de um perfil */
export const mkMlKey = (gameId: string, profile: string) =>
  `game:${gameId}:profile:${profile}:modlist`;
