#!/usr/bin/env node
/**
 * check-relative-paths.mjs
 *
 * Verifica que nenhum caminho relativo com `__dirname` no processo main aponte
 * para FORA do projeto quando o código é empacotado.
 *
 * Por que: o electron-vite empacota o processo main em out/main (index.js +
 * chunks/). Nesse bundle, `__dirname` NÃO é o diretório do arquivo-fonte — é
 * `out/main` (imports estáticos) ou `out/main/chunks` (chunks dinâmicos).
 * Paths do tipo `path.join(__dirname, "../../../_resources/...")` quebravam
 * resolvendo para `/home/user/_resources` (fora do projeto).
 *
 * Regra: para cada uso de `path.join(__dirname, ...)` / `path.resolve(__dirname, ...)`
 * com segmentos literais, resolve a partir de `out/main` e `out/main/chunks`
 * (e do próprio diretório do arquivo no caso da CompactFlow, que roda do source)
 * e falha se o resultado cair fora da raiz do projeto.
 *
 * Uso: node scripts/check-relative-paths.mjs   (exit 1 se houver violações)
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BUNDLE_BASES = [path.join(PROJECT_ROOT, "out", "main"), path.join(PROJECT_ROOT, "out", "main", "chunks")];

// Arquivos que rodam do source (não passam pelo bundle) — o __dirname deles é
// o próprio diretório do arquivo.
const SOURCE_RUN_PREFIXES = [
  path.join("app", "_main", "installer-api", "CompactFlow"),
  path.join("app", "_resources", "compact-flow"),
];

const SEGMENT_RE = /["']((?:[^"']|\\["'])+)["']/g;

// (join|resolve)( __dirname , "seg", "seg", ... )
const USAGE_RE = /\b(join|resolve)\(\s*__dirname\s*((?:,\s*["'][^"']*["']\s*)*)\)/g;

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "_venv" || entry.name === "out" || entry.name === ".git") continue;
      yield* walk(full);
    } else if (/\.(ts|js|cjs|mjs)$/.test(entry.name)) {
      yield full;
    }
  }
}

function runsFromSource(relPath) {
  return SOURCE_RUN_PREFIXES.some((p) => relPath === p || relPath.startsWith(p + path.sep));
}

function extractSegments(args) {
  const segments = [];
  SEGMENT_RE.lastIndex = 0;
  let m;
  while ((m = SEGMENT_RE.exec(args)) !== null) segments.push(m[1]);
  return segments;
}

const violations = [];
let scannedFiles = 0;
let scannedUsages = 0;

for (const abs of walk(PROJECT_ROOT)) {
  const rel = path.relative(PROJECT_ROOT, abs);
  if (!rel.startsWith("app" + path.sep) && !rel.startsWith("src" + path.sep + "main" + path.sep)) continue;

  const src = fs.readFileSync(abs, "utf-8");
  USAGE_RE.lastIndex = 0;
  let usage;

  while ((usage = USAGE_RE.exec(src)) !== null) {
    const segments = extractSegments(usage[2]);
    if (segments.length === 0) continue;
    scannedUsages++;

    const bases = runsFromSource(rel) ? [path.dirname(abs)] : BUNDLE_BASES;
    for (const base of bases) {
      const resolved = path.resolve(base, ...segments);
      const relToRoot = path.relative(PROJECT_ROOT, resolved);
      if (relToRoot === ".." || relToRoot.startsWith(".." + path.sep) || path.isAbsolute(relToRoot)) {
        const line = src.slice(0, usage.index).split("\n").length;
        violations.push({
          file: rel,
          line,
          resolved,
          base,
          usage: usage[0].trim(),
        });
      }
    }
  }
  scannedFiles++;
}

if (violations.length > 0) {
  console.error(`❌ check-relative-paths: ${violations.length} caminho(s) __dirname resolvendo para FORA do projeto:\n`);
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}`);
    console.error(`    uso: ${v.usage}`);
    console.error(`    base: ${v.base}`);
    console.error(`    resolve: ${v.resolved}\n`);
  }
  console.error(`(verificados ${scannedFiles} arquivos, ${scannedUsages} usos de __dirname)`);
  process.exit(1);
}

console.log(`✅ check-relative-paths: OK (${scannedFiles} arquivos, ${scannedUsages} usos de __dirname — todos dentro do projeto)`);
