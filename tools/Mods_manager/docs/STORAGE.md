# Storage

> Como o Mods Manager persiste dados.

---

## Armazenamento

`ModStorageService` — store JSON persistido em:
```
~/.config/electron-app/mods-store.json
```

---

## Chaves

### Config do Jogo
```
game:{gameId}:config
```
```json
{
  "gamePath": "/home/user/Games/SkyrimSE",
  "stagingDir": "~/Games/Mods/skyrim-se/staging",
  "protonPrefix": "~/Games/Prefix/skyrim-se/",
  "protonVersion": "Proton-GE"
}
```

### Modlist
```
game:{gameId}:profile:{profile}:modlist
```
```json
[
  {
    "name": "SKSE64",
    "enabled": true,
    "installDate": "2025-01-15T10:30:00Z"
  }
]
```

### Plugins
```
game:{gameId}:profile:{profile}:plugins
```
```json
[
  { "name": "Skyrim.esm", "enabled": true },
  { "name": "Update.esm", "enabled": true }
]
```

### Inventory do Mod
```
game:{gameId}:mod:{modName}:inventory
```
```json
{
  "type": "skse",
  "files": ["SKSE64.dll", "skse64_loader.exe"],
  "espFiles": ["mod.esp"],
  "bsaFiles": ["mod.bsa"]
}
```

### Proton Global
```
proton_binary
```
```
"/home/user/.steam/steam/compatibilitytools.d/Proton-GE/proton"
```

### Ferramentas Externas
```
external_tools
```

### Selecoes FOMOD
```
game:{gameId}:fomod_selections:{modName}
```

---

## Padrão de Chaves

```
game:{gameId}:{tipo}

Tipos:
  config              → configuracao do jogo
  profile:{name}:modlist  → mods do perfil
  profile:{name}:plugins  → plugins do perfil
  mod:{name}:inventory    → inventario do mod
  fomod_selections:{name} → selecoes FOMOD
```

---

## Operacoes

| Metodo | Descricao |
|--------|-----------|
| `ModStorageService.get(key)` | Le valor |
| `ModStorageService.put(key, value)` | Grava valor |
| `ModStorageService.delete(key)` | Deleta chave |
| `ModStorageService.entries(prefix?)` | Lista como pares [key, value] |
| `ModStorageService.keys(prefix?)` | Lista so chaves |
