# Play: Aba Games vs Mod Manager

> **Regra de ouro: Jogo ≠ Mod.**
> A **aba Games** apenas **inicializa o jogo**. O **Mod Manager** inicializa o jogo **com os mods**.
> O botão Play da aba Games **nunca** deve implantar mods na pasta do jogo.

---

## Contexto do bug (18/08/2026)

O app apagava o jogo copiado no prefixo ao clicar em Play na aba Games. O usuário
reproduziu ao vivo várias vezes: instalava o jogo (arquivos copiados para o prefixo),
clicava em Play e a pasta do jogo ficava **vazia** — `Game.exe` e os ~5.246 arquivos
sumiam, e o launch falhava com `Nenhum executável encontrado`.

### Causa raiz

Ambos os fluxos (aba Games **e** Mod Manager) chamavam o mesmo evento IPC
`modPlayGame`, que **sempre** executava o passo *"Step 7: Deploy mods"* no fluxo de
play — mesmo quando o jogo não tinha nenhum mod.

A cadeia destrutiva era:

```
modPlayGame (aba Games, sem mods)
  └─ playGame() → Step 7 "Deploy mods"
       └─ deployGeneric(gamePath=<pasta do jogo>, modlist=[])
            └─ linkAll(filemap={}, targetBaseDir=<pasta do jogo>)
                 └─ removeDeployedLinks(<pasta do jogo>)
                      └─ fs.unlinkSync(...)  ← apagava TODO arquivo do jogo
```

Em `app/Catalogo/GameMod/games/_shared/symlink.ts`, a função `linkAll()` chamava
`removeDeployedLinks(targetBaseDir)` **antes** de criar qualquer link — e
`removeDeployedLinks()` apagava **recursivamente todos os arquivos** (não só
symlinks). Com filemap vazio (0 mods), o resultado era: apagar o jogo inteiro e
depois "criar" 0 links.

**Evidência no log (sessão 03:27):**

```
03:27:22.725 scan    → gamePath EXISTE (jogo copiado, 963M)
03:27:23.0xx deploy  → "3 operações" (313ms — apagando os 5.246 arquivos)
03:27:23.048 launch  → "Nenhum executável encontrado" (jogo já apagado)
```

---

## Correção aplicada

### 1. Separação de responsabilidades (a correção principal)

`modPlayGame` agora recebe a opção `{ deployMods: boolean }`:

| Chamador | Chamada | Deploy de mods |
|---|---|---|
| **Aba Games** (`use-games.ts`) | `modPlayGame(gameId)` | **NUNCA** (default `false`) |
| **Mod Manager** (`useLaunchGame.ts`) | `modPlayGame(gameId, profile, { deployMods: true })` | **SIM** |

Arquivos alterados:

- `app/Games/services/game-launcher/play/index.ts` — handler `modPlayGame` aceita
  `options?: { deployMods?: boolean }` e repassa para `playGame()`.
- `app/Games/services/game-launcher/play/play-game.ts` — `playGame(..., deployMods = false)`.
  O Step 7 só implanta mods quando `deployMods === true` **e** há mods habilitados.
  Caso contrário, loga *"Aba Games: sem deploy de mods (inicializar jogo apenas)"*.
- `app/Catalogo/GameMod/ui/hooks/useLaunchGame.ts` — o Mod Manager passa `{ deployMods: true }`.
- `src/preload/index.ts` + `app/_shared/types/declaration.d.ts` — assinatura do
  preload e JSDoc explicando a regra.

### 2. Correções destrutivas de fundo (defesa em profundidade)

Mesmo que alguém chame o deploy sem mods no futuro, ele não pode mais apagar o jogo:

- `app/Catalogo/GameMod/games/_shared/symlink.ts`
  - `removeDeployedLinks()` agora remove **apenas symlinks** — nunca arquivos comuns.
  - `linkAll()` com filemap vazio **não toca no diretório** (early return).
- `app/Catalogo/GameMod/games/generic/index.ts`
  - `deployGeneric()` e `deployGenericWithRouting()` retornam cedo quando o filemap
    está vazio (0 mods): *"Sem mods habilitados — nada a implantar (jogo intacto)"*.

---

## Como testar

1. Instale um jogo portátil (ex.: que o installer detecte como executável e copie
   para o prefixo).
2. **Aba Games → Play**: o jogo deve abrir **sem** nenhuma operação de mods
   (log: `deployMods=false`; Step 7: "Aba Games: sem deploy de mods").
3. Verifique que a pasta do jogo no prefixo **continua intacta** após o play.
4. **Mod Manager → ▶ Iniciar Jogo**: deve implantar os mods habilitados do perfil
   antes do launch (log: `deployMods=true`).

---

## Botões Play (anotações na UI)

Para que o erro nunca volte por falta de clareza, os botões Play têm tooltip
explicando a função:

| Onde | Botão | Tooltip |
|---|---|---|
| Aba Games — GameBar (`game-bar.tsx`) | `Games / Games` | "Aba Games: inicializa apenas o jogo (SEM mods). Para jogar com mods habilitados, use o Mod Manager (▶ Iniciar Jogo)." |
| Aba Games — Card grande (`GameLargeCard.tsx`) | `▶ Jogar` | Mesma explicação da separação |
| Aba Games — Linha compacta (`GameCompactRow.tsx`) | `▶` | Mesma explicação da separação |
| Mod Manager (`ModManagerTopBar.tsx`) | `▶ Iniciar Jogo` | "Mod Manager: inicializa o jogo COM deploy dos mods habilitados do perfil (diferente do botão ▶ Jogar da aba Games, que só inicializa o jogo, sem mods)" |

---

## Arquivos envolvidos

| Arquivo | Papel |
|---|---|
| `app/Games/services/game-launcher/play/index.ts` | Handler IPC `modPlayGame` (recebe `deployMods`) |
| `app/Games/services/game-launcher/play/play-game.ts` | Fluxo de play; Step 7 condicionado a `deployMods` |
| `app/Catalogo/GameMod/games/_shared/symlink.ts` | `removeDeployedLinks` só symlinks; `linkAll` não apaga com filemap vazio |
| `app/Catalogo/GameMod/games/generic/index.ts` | `deployGeneric`/`deployGenericWithRouting` com early return sem mods |
| `app/Catalogo/GameMod/ui/hooks/useLaunchGame.ts` | Mod Manager → `{ deployMods: true }` |
| `app/Games/pages/games/hooks/use-games.ts` | Aba Games → `modPlayGame(gameId)` (sem deploy) |
| `src/preload/index.ts` | Expoe `modPlayGame(gameId, profile?, options?)` |
| `app/_shared/types/declaration.d.ts` | Tipos + JSDoc da regra |
