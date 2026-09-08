# Compilar o ProtonForge

Guia rápido para desenvolvedores.

## Compilar (só o código)

```bash
npm run build
```

Compila `src/` → `out/`. Não instala nada, não baixa nada.

## Rodar

```bash
./run.sh
```

## Reinstalar tudo (se quebrar)

```bash
npm run reinstall
```

Faz automático:
1. Remove `node_modules`
2. Instala dependências
3. Baixa Electron
4. Restaura `app/_venv/`
5. Restaura recursos customizados
6. Compila o app
7. Corrige permissões

## Fluxo normal

```
edita src/ → npm run build → ./run.sh → testa → repete
```

Se quebrar: `npm run reinstall` resolve.
