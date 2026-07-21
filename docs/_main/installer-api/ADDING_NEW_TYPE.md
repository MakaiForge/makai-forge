# Como adicionar um novo tipo de instalador

Guia passo-a-passo para estender a Installer API com um novo formato de instalador.

## Passo 1: Crie o extrator

Crie um arquivo em `src/compatflow/bridge/installer/extractors/<nome>.js`:

```javascript
// extractors/meu-formato.js

/**
 * Extrai um instalador no formato MeuFormato.
 *
 * @param {object} info - Informações do classifier
 * @param {object} options - Opções de extração
 * @returns {Promise<ExtractResult>}
 */
async function extract(info, options) {
  const { destPath, onProgress } = options;

  onProgress?.('Extraindo com MeuFormato...');

  try {
    // Sua lógica de extração aqui
    const result = execFileSync('minha-ferramenta', [
      'x', '-y', '-o' + destPath, info.originalPath
    ], { stdio: 'pipe', timeout: 300000 });

    // Escaneia executáveis no destino
    const candidates = scanForExes(destPath);

    return {
      success: true,
      destDir: destPath,
      candidates,
      registryNeeded: false,
      error: null
    };
  } catch (err) {
    return {
      success: false,
      destDir: null,
      candidates: [],
      registryNeeded: false,
      error: err.message
    };
  }
}

module.exports = { extract };
```

Requisitos do extrator:
- Deve exportar uma função `extract(info, options)`
- `info` tem os campos documentados no `classification.md`
- `options` tem `destPath`, `protonPath`, `source`, `gameId`, `onProgress`, `signal`
- Deve retornar um `ExtractResult` válido
- Deve ser resiliente (try/catch, timeout, cleanup em caso de erro)

## Passo 2: Registre no classifier

Edite `src/compatflow/bridge/installer/classifier.js` e adicione a detecção:

```javascript
// classifier.js

function classify(sourcePath) {
  const ext = path.extname(sourcePath).toLowerCase();
  const stat = fs.statSync(sourcePath);

  // --- Sua detecção aqui ---
  if (ext === '.meuformato') {
    return {
      type: 'meu-formato',
      method: 'minha-ferramenta',
      needsWine: false,
      needsRegistrySetup: false,
      confidence: 0.95,
      gameName: guessGameName(sourcePath),
      companionArchives: [],
      originalPath: sourcePath,
      details: { /* debug info */ }
    };
  }

  // --- Detecções existentes continuam aqui ---
}
```

## Passo 3: Registre no index.js

Edite `src/compatflow/bridge/installer/index.js` e adicione o mapping:

```javascript
const extractors = {
  'pure-archive': require('./extractors/archive'),
  'exe-with-companions': require('./extractors/exe-companions'),
  'sfx': require('./extractors/sfx-nsis'),
  'nsis': require('./extractors/sfx-nsis'),
  'inno-std': require('./extractors/inno-std'),
  'inno-custom': require('./extractors/wine-fallback'),
  'portable': require('./extractors/portable'),
  'iso': require('./extractors/iso'),
  'unknown': require('./extractors/wine-fallback'),
  // ADICIONE AQUI:
  'meu-formato': require('./extractors/meu-formato'),
};
```

## Passo 4: Documente

Adicione uma seção no `extraction.md` explicando:
- O que é o formato
- Quando ele aparece (exemplos reais)
- Como a extração funciona
- Comando usado

## Checklist

- [ ] Extrator criado em `extractors/<nome>.js`
- [ ] Função `extract(info, options)` exportada
- [ ] Extrator registrado no `classifier.js`
- [ ] Extrator registrado no `index.js` (mapping)
- [ ] Documentado em `extraction.md`
- [ ] Testado com pelo menos um jogo real

## Boas práticas

1. **Sempre prefira extração nativa** a Wine — é 5-10x mais rápido
2. **Use as ferramentas do sistema** (`7z`, `unrar`, `unzip`, `tar`, `innoextract`) — evite dependências novas
3. **Tolerante a falhas** — se a extração nativa falhar, o classifier deve rebaixar o tipo ou o extrator deve lançar erro claro
4. **Progresso** — use `onProgress` para reportar o que está fazendo
5. **Cleanup** — sempre limpe pastas temporárias, mesmo em caso de erro
6. **Source** — respeite o parâmetro `source` para rastreabilidade
