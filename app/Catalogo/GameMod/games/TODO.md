# Games Folder — TODO e Análise

## Visão Geral

A pasta `games/` contém 37 jogos + `generic/` + `_shared/`. Cada jogo é um módulo **independente e autocontido**. Estruturas similares **não são duplicação** — é como o projeto funciona.

**Filosofia:**
- Cada pasta de jogo é uma "caixa fechada" pro seu jogo
- Quando você vai testar mods do Fallout 3, modifica apenas `fallout3/`
- Quando vai testar Skyrim, modifica apenas `skyrim/`
- Cada jogo pode ter ajustes únicos no futuro — por isso mantém seus próprios arquivos
- O que é universal (extrair, instalar, detectar tipo) ficou nos services
- O que é do jogo (deploy, tools, routing, invalidation) fica na pasta do jogo

**O aplicativo é universal** — suporta qualquer tipo de mod, não apenas os listados. No futuro serão adicionados mais jogos (Ancient Impact, ZZZ, etc.).

---

## Camada `_shared/` — Infraestrutura Compartilhada

O `_shared/` fornece **funções utilitárias**, NÃO substitui os arquivos locais. Cada jogo importa do `_shared/` o que precisa, mas mantém seus próprios arquivos.

| Arquivo | Responsabilidade | Usado Por |
|---------|------------------|-----------|
| `bethesda-deploy.ts` | Deploy para jogos Bethesda | skyrim-se, skyrim-vr, enderal, enderal-se |
| `bethesda-deploy-helpers.ts` | Helpers de deploy | skyrim/ |
| `bethesda-invalidation.ts` | Invalidation de arquivos | skyrim/ |
| `bethesda-plugins.ts` | Gerenciamento de plugins | skyrim/ |
| `bethesda-archives.ts` | Manipulação BA2/BSA | Todos Bethesda |
| `bethesda-constants.ts` | SE_PATTERNS, KNOWN_TOOLS | Todos Bethesda |
| `bethesda-restore.ts` | Restore de deploy | skyrim-se, skyrim-vr, enderal, enderal-se |
| `filemap.ts` | Construção de filemap | Todos |
| `launch.ts` | Launch via Steam/Proton | Todos |
| `prefix.ts` | DLL overrides | Todos |
| `symlink.ts` | Criação de symlinks | Todos |
| `types.ts` | GameModule interface | Todos |
| `archive.ts` | Extração de archives | Todos |

---

## Estrutura por Jogo

### Bethesda Gen 1 (6 jogos)
Cada jogo tem 7 arquivos — módulo independente:
```
fallout3/
├── fallout3.constants.ts  ← Steam App ID, paths, configs
├── index.ts               ← factory function (usa _shared/ como infra)
├── frameworks.ts          ← script extender info
├── launch.ts              ← launch config
├── prefix.ts              ← DLL overrides
├── routing.ts             ← regras de roteamento
└── tools.ts               ← ferramentas externas
```

**Jogos:** fallout3, falloutnv, fallout4, fallout4-vr, oblivion, starfield

### Bethesda Gen 2 (4 jogos)
Mesma estrutura, mas com `deploy.ts` wrapper:
- skyrim-se, skyrim-vr, enderal, enderal-se

### Skyrim Base (1 jogo)
Estrutura expandida com `installer/`:
- skyrim (18 arquivos incluindo FOMOD installer)

### Morrowind (1 jogo)
Lógica própria — usa "Data Files", Morrowind.ini

### Non-Bethesda (22 jogos)
Estrutura simplificada com 6 arquivos:
- witcher3, cyberpunk2077, larian (BG3), minecraft, stardewvalley, valheim, rimworld, factorio, projectzomboid, bannerlord, 7daystodie, subnautica, thelongdark, satisfactory, terraria, donotfeedthemonkeys, kerbalspaceprogram, battletech, dragonageorigins, dragonage2, masseffect, xcom2

---

## O Que Fazer

### Fase 1: Limpar Código Morto ✅ CONCLUÍDA

**Ação tomada:** 24 arquivos mortos deletados (códigos que existiam localmente mas não eram importados pelos próprios `index.ts`).

**Total removido:** ~4,032 linhas

**Verificação:** Todos os imports foram conferidos — nenhum depende dos arquivos removidos.

### Fase 2: Verificar Consistência ✅ CONCLUÍDA

**Resultado:** 34/34 jogos usam `_shared/` corretamente — nenhum import quebrado.

#### Problemas Encontrados

| Jogo | Problema | Severidade |
|------|----------|------------|
| **stardewvalley** | `constants.ts` diz `deployDir: "Mods"` mas `deploy.ts` usa `"Content"` — contradição | 🔴 Alta |
| **masseffect** | Deploy target `"BioGame/DLC"` pode estar errado para mods Legendary Edition | 🟡 Média |
| **witcher3** | Falta `launch.ts`, `getScriptExtender()`, `getArchiveHandlers()` | 🟡 Média |
| **cyberpunk2077** | `deployDirs` define 4 diretórios mas só `archive/pc/mod` é usado | 🟢 Baixa |
| **donotfeedthemonkeys** | Constants quase vazias (`exeName: ""`, `deployDir: ""`) | 🟢 Baixa |

#### Melhorias Opcionais (não bloqueantes)

| Item | Jogos Afetados | Nota |
|------|----------------|------|
| `routing.ts` morto | fallout3, falloutnv, fallout4, fallout4-vr, oblivion, starfield | index.ts define routing inline |
| `restore` vazio | mesmos 6 jogos | `restore: async () => {}` |
| Falta `launch.ts` | 22 jogos non-Bethesda | Sem suporte a launch |
| `require()` em ESM | skyrim-se, skyrim-vr, enderal, enderal-se + 6 Bethesda Gen 1 | Funciona mas não é idiomatico |
| `tools.ts` duplicado | skyrim-se, skyrim-vr, enderal, enderal-se | Idêntico ao skyrim/tools.ts |

### Fase 3: Documentar Diferenças Reais ✅ CONCLUÍDA

**Arquivo criado:** `games/DIFFERENCES.md`

**Conteúdo:**
- Tabela resumo de todos os 34 jogos
- Referência detalhada por jogo (Steam App ID, deploy dir, script extender, plugins, etc.)
- Comportamentos únicos de cada jogo
- Diferenças entre variantes (Skyrim LE vs SE vs VR, etc.)

---

## Princípios a Seguir

1. **Cada jogo tem sua pasta** — módulo independente e autocontido
2. **Estrutura similar é intencional** — consistência, não duplicação
3. **Cada jogo pode ter ajustes únicos** — mantenha os arquivos locais mesmo se parecem iguais
4. **`_shared/` é infraestrutura** — funções utilitárias, não substituições
5. **O que é único deve permanecer local** — constants, tools, config específicas
6. **Manter compatibilidade** — não quebrar jogos existentes
7. **O aplicativo é universal** — prepare para novos jogos no futuro

---

## Priorização

| Prioridade | Fase | Esforço | Impacto | Status |
|------------|------|---------|---------|--------|
| ~~🔴 Alta~~ | ~~Fase 1: Limpar código morto~~ | ~~Baixo~~ | ~~Alto (limpeza)~~ | ✅ Concluída |
| ~~🟡 Média~~ | ~~Fase 2: Verificar consistência~~ | ~~Baixo~~ | ~~Médio (qualidade)~~ | ✅ Concluída |
| ~~🟢 Baixa~~ | ~~Fase 3: Documentar diferenças~~ | ~~Baixo~~ | ~~Baixo (docs)~~ | ✅ Concluída |
