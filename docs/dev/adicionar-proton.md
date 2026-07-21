# Adicionar Novo Proton Tool

## Regra Fundamental

O `directoryNameFormat` **deve conter** o identificador da tool. Sempre.

## Por quê?

Quando um Proton é baixado, o `formatDirName()` gera o nome da pasta final. Depois, `findToolByFolder()` escaneia as pastas e tenta匹配-las com as tools conhecidas usando **keywords**.

Se o `directoryNameFormat` não incluir o identificador, a pasta final não terá a keyword — e a tool não aparecerá como instalada.

## Funciona ✅

```ts
// tool.id: "proton-meu-tool"
// keywords: ["meu-tool"]

directoryNameFormat: "Proton-MeuTool-$version"
// → pasta: "Proton-MeuTool-1.0"  contém "meu-tool" ✅
```

## Não funciona ❌

```ts
// tool.id: "proton-meu-tool"
// keywords: ["meu-tool"]

directoryNameFormat: "Proton-$version"
// → pasta: "Proton-1.0"  NÃO contém "meu-tool" ❌
```

## Exemplo Real (CachyOS)

Antes (quebrado):
```ts
directoryNameFormat: "Proton-$version",
```
Pasta virava `Proton-11.0` — "cachyos" desaparecia.

Depois (corrigido):
```ts
directoryNameFormat: "Proton-CachyOS-$version",
```
Pasta vira `Proton-CachyOS-11.0` — "cachyos" está no nome ✅

## Checklist ao adicionar

- [ ] `keywords` no `allTools` (em `tools/index.ts`)
- [ ] `directoryNameFormat` contém o identificador
- [ ] A keyword aparece no nome da pasta gerado por `formatDirName()`
