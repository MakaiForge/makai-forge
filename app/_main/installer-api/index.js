const fs = require('fs');
const { classify } = require('./classifier');
const utils = require('./utils');

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
};

function validateOptions(options) {
  if (!options) throw new Error('options is required');
  if (!options.destPath) throw new Error('options.destPath is required');
  if (!options.source) throw new Error('options.source is required (catalog | manual | compactflow)');
  if (!['catalog', 'manual', 'compactflow'].includes(options.source)) {
    throw new Error(`Invalid source: ${options.source}. Must be catalog, manual, or compactflow`);
  }
}

function analyze(sourcePath, gameId, gameTitle) {
  if (!sourcePath) throw new Error('sourcePath is required');
  const stat = fs.statSync(sourcePath);
  return classify(sourcePath, gameId, gameTitle);
}

function extract(installInfo, options) {
  validateOptions(options);

  if (!installInfo || !installInfo.type) {
    throw new Error('installInfo with valid type is required');
  }

  const extractor = extractors[installInfo.type];
  if (!extractor) {
    throw new Error(`No extractor found for type: ${installInfo.type}`);
  }

  return extractor.extract(installInfo, options);
}

if (require.main === module) {
  const args = {};
  for (let i = 2; i < process.argv.length; i++) {
    const key = process.argv[i].replace(/^--/, '');
    const val = process.argv[++i];
    args[key] = val;
  }

  if (args.analyze) {
    const info = analyze(args.analyze, args.gameId || null, args.gameTitle || null);
    console.log(JSON.stringify(info));
    process.exit(0);
  }

  if (args.extract && args.dest && args.source) {
    const infoPath = args.info || args.analyze;
    let info;
    if (infoPath && fs.existsSync(infoPath)) {
      info = JSON.parse(fs.readFileSync(infoPath, 'utf8'));
    } else {
      info = analyze(args.extract);
    }
    try {
      const result = extract(info, {
        destPath: args.dest,
        protonPath: args.protonPath || null,
        source: args.source,
        gameId: args.gameId || null,
        onProgress: (msg) => console.error(`[progress] ${msg}`),
      });
      console.log(JSON.stringify(result));
      process.exit(result.success ? 0 : 1);
    } catch (err) {
      console.error(err.message);
      process.exit(1);
    }
  }

  console.error('Usage:');
  console.error('  --analyze <path>              Analyze an installer');
  console.error('  --extract <path> --dest <dir> --source <catalog|manual|compactflow> [--info <json>] [--protonPath <path>]');
}

module.exports = {
  analyze,
  extract,
  classify,
  utils,
  extractors,
};
