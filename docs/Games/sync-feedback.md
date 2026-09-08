# Plano de Correção — Item #1: Feedback Visual na Sincronização Steam

## Problema

**Local:** `src/renderer/src/pages/games/games.tsx:135-145` e `278-280`

A função `handleSyncSteam` executa a sincronização da biblioteca Steam do usuário. Ela é chamada:
1. Automaticamente ao montar a página (`useEffect` linha 278)
2. Manualmente pelo botão "Sincronizar Steam"

Em caso de falha, o erro é apenas logado no `console.error`. O usuário **não recebe nenhum feedback visual** — não sabe se:
- A sincronização falhou por problemas de rede
- O Steam não está rodando
- A biblioteca está vazia
- Houve um erro interno

O `loading` do `useGames` também é ignorado no JSX (item #6), agravando a sensação de "tela vazia sem explicação".

## Solução

### 1. Adicionar toast de erro na sincronização

Usar o sistema de toast já existente no app (`useToast` → `showErrorToast`) para exibir uma mensagem clara quando a sincronização falhar.

### 2. Adicionar toast de sucesso

Mostrar feedback positivo quando a sincronização for bem-sucedida, informando quantos jogos foram encontrados.

### 3. Tratar caso de "nenhum jogo encontrado" no sync

Se o sync completar mas retornar lista vazia, avisar ao invés de silêncio total.

## Implementação

### Alterações no arquivo `games.tsx`

```typescript
// 1. Adicionar import do hook useToast (linha 2)
import { useAppDispatch, useToast } from "@renderer/hooks";

// 2. No corpo do componente, obter o hook (após linha 72)
const { showErrorToast, showSuccessToast } = useToast();

// 3. Modificar handleSyncSteam (linhas 135-145)
const handleSyncSteam = useCallback(async () => {
  setSyncing(true);
  try {
    const games = await window.electron.syncSteamLibrary();
    setSteamGames(games);
    if (games.length === 0) {
      showSuccessToast("Steam sincronizada", "Nenhum jogo Steam encontrado.");
    } else {
      showSuccessToast(
        "Steam sincronizada",
        `${games.length} jogo(s) encontrado(s).`
      );
    }
  } catch (err) {
    console.error("Steam sync failed", err);
    showErrorToast(
      "Falha na sincronização",
      "Não foi possível sincronizar sua biblioteca Steam. Verifique se o Steam está rodando e tente novamente."
    );
  } finally {
    setSyncing(false);
  }
}, [showSuccessToast, showErrorToast]);
```

## Arquivos afetados

| Arquivo | Tipo de alteração |
|---|---|
| `src/renderer/src/pages/games/games.tsx` | Adicionar import + hook + toasts no `handleSyncSteam` |

## Riscos

- **Nenhum.** O sistema de toast já é utilizado em outras partes do app.
- O hook `useToast` é um wrapper thin do Redux dispatch, sem efeitos colaterais.
- A assinatura de `handleSyncSteam` não muda, então o `useEffect` da linha 278 continua funcionando.
- As strings estão em português, consistentes com o resto da página ("Meus Jogos", "Sincronizar Steam", "Nenhum jogo encontrado").

## Testes sugeridos

- [ ] Clicar em "Sincronizar Steam" com Steam fechado → ver toast de erro
- [ ] Clicar em "Sincronizar Steam" com Steam rodando → ver toast de sucesso
- [ ] Verificar se o toast de erro aparece na sincronização automática ao montar a página
- [ ] Verificar se `syncing` volta a `false` mesmo com erro (já funciona, `finally`)
