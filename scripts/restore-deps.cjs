const { execSync } = require("node:child_process");
const {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  cpSync,
  rmSync,
  readdirSync,
} = require("node:fs");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const projectRoot = process.cwd();
const cacheDir = path.join(os.homedir(), ".cache", "electron");
const customResourcesBackup = path.join(projectRoot, ".backup-resources");

const GITHUB_REPO = "lucasgertke11-bot/Proton_Forge";
const RESOURCES_VERSION = "v1";

const run = (command, options = {}) => {
  console.log(`\n> ${command}`);
  execSync(command, {
    cwd: projectRoot,
    stdio: "inherit",
    ...options,
  });
};

const fileExists = (p) => existsSync(path.join(projectRoot, p));

const backupCustomResources = () => {
  const customDir = path.join(projectRoot, "resources");
  if (!existsSync(customDir)) return;

  console.log("📂 Fazendo backup dos recursos customizados...");
  if (existsSync(customResourcesBackup))
    rmSync(customResourcesBackup, { recursive: true });

  cpSync(customDir, customResourcesBackup, { recursive: true });
};

const restoreCustomResources = () => {
  const electronResourcesDist = path.join(
    projectRoot,
    "node_modules/electron/dist/resources"
  );

  // Tenta restaurar do backup local
  if (existsSync(customResourcesBackup) && existsSync(electronResourcesDist)) {
    console.log("📂 Restaurando recursos customizados no Electron...");
    const resources = readdirSync(customResourcesBackup);
    for (const resource of resources) {
      const src = path.join(customResourcesBackup, resource);
      const dest = path.join(electronResourcesDist, resource);
      cpSync(src, dest, { recursive: true });
      console.log(`  → ${resource}`);
    }
    return;
  }

  // Tenta baixar do GitHub Release
  console.log("☁️ Baixando recursos da Release do GitHub...");
  if (!existsSync(electronResourcesDist)) {
    mkdirSync(electronResourcesDist, { recursive: true });
  }

  const tarPath = path.join("/tmp", `protonforge-resources-${RESOURCES_VERSION}.tar.gz`);
  try {
    // Tenta release primeiro
    const releaseUrl = `https://github.com/${GITHUB_REPO}/releases/download/resources-${RESOURCES_VERSION}/protonforge-resources-${RESOURCES_VERSION}.tar.gz`;
    run(`curl -sL -o "${tarPath}" "${releaseUrl}"`);

    if (!existsSync(tarPath) || (existsSync(tarPath) && readFileSync(tarPath).length < 1000)) {
      throw new Error("Release download failed");
    }

    run(`tar xzf "${tarPath}" -C "${electronResourcesDist}"`);
    // Também restaura pro projeto
    const projResources = path.join(projectRoot, "resources");
    if (existsSync(projResources)) rmSync(projResources, { recursive: true });
    cpSync(electronResourcesDist, projResources, { recursive: true });
    console.log("✅ Recursos restaurados da Release!");
  } catch (e) {
    console.log("⚠️ Release não encontrada. Tentando raw do repositório...");
    try {
      run(`curl -sL -o "${tarPath}" "https://github.com/${GITHUB_REPO}/archive/master.tar.gz"`);
      run(`tar xzf "${tarPath}" -C /tmp`);
      const extracted = path.join("/tmp", "Proton_Forge-master", "resources");
      if (existsSync(extracted)) {
        const items = readdirSync(extracted);
        for (const item of items) {
          const src = path.join(extracted, item);
          const dest = path.join(electronResourcesDist, item);
          cpSync(src, dest, { recursive: true });
        }
        const projResources = path.join(projectRoot, "resources");
        if (existsSync(projResources)) rmSync(projResources, { recursive: true });
        cpSync(extracted, projResources, { recursive: true });
      }
      rmSync("/tmp/Proton_Forge-master", { recursive: true, force: true });
    } catch (e2) {
      console.log("⚠️ Não foi possível baixar do GitHub. Crie a release manualmente.");
    }
  }
  rmSync(tarPath, { force: true });
};

const setupPythonEnv = () => {
  const venvPath = path.join(projectRoot, "venv");
  const venvPython = path.join(venvPath, "bin", "python3");
  const venvZip = path.join(projectRoot, "resources", "venv.tar.gz");

  // Verifica se o venv está saudável
  if (existsSync(venvPython)) {
    try {
      execSync(`"${venvPython}" -c "import json, http, threading"`, {
        stdio: "ignore",
        timeout: 5000,
      });
      console.log("✅ Venv já está funcionando.");
      return;
    } catch {
      console.log("⚠️ Venv corrompido. Recriando...");
      rmSync(venvPath, { recursive: true, force: true });
    }
  }

  // Tenta restaurar do zip local primeiro
  if (existsSync(venvZip)) {
    console.log("📦 Restaurando venv do arquivo local...");
    mkdirSync(venvPath, { recursive: true });
    run(`tar xzf "${venvZip}" -C "${venvPath}"`);
    if (existsSync(venvPython)) {
      console.log("✅ Venv restaurado do arquivo local.");
      return;
    }
    console.log("⚠️ Arquivo local corrompido. Recriando via pyenv...");
    rmSync(venvPath, { recursive: true, force: true });
  }

  // Fallback: pyenv
  console.log("🐍 Configurando Python 3.10 via pyenv...");
  const homeDir = os.homedir();
  const pyenvRoot = path.join(homeDir, ".pyenv");
  const pyenvPython = path.join(pyenvRoot, "versions", "3.10.20", "bin", "python3");

  if (!existsSync(pyenvRoot)) {
    run(`git clone https://github.com/pyenv/pyenv.git "${pyenvRoot}"`);
  }

  const pyenvBin = path.join(pyenvRoot, "bin", "pyenv");
  if (!existsSync(pyenvPython)) {
    run(`"${pyenvBin}" install 3.10`);
  }

  run(`"${pyenvPython}" -m venv "${venvPath}"`);

  const reqPath = path.join(projectRoot, "python_rpc", "requirements.txt");
  if (existsSync(reqPath)) {
    console.log("📦 Instalando dependências Python...");
    run(`"${venvPython}" -m pip install -r "${reqPath}" --quiet`);
  }

  console.log("✅ Python venv pronto em venv/");
};

const restore = () => {
  console.log("🔧 Restaurando dependências do ProtonForge...\n");

  const configBackup = fileExists("config.json")
    ? readFileSync("config.json", "utf-8")
    : null;
  const envBackup = fileExists(".env") ? readFileSync(".env", "utf-8") : null;

  backupCustomResources();

  if (fileExists("node_modules")) {
    console.log("⚠️ Removendo node_modules...");
    run("rm -rf node_modules");
  }

  if (fileExists("package-lock.json")) {
    console.log("⚠️ Removendo package-lock.json...");
    run("rm package-lock.json");
  }

  console.log("\n📦 Instalando dependências (ignorando postinstall)...");
  run("yarn install --ignore-scripts");

  console.log("\n⬇️ Baixando Electron...");
  const electronPkg = JSON.parse(
    readFileSync(
      path.join(projectRoot, "node_modules/electron/package.json"),
      "utf-8"
    )
  );
  const electronVersion = electronPkg.version;
  const electronZip = path.join(projectRoot, "electron-tmp.zip");
  const electronUrl = `https://github.com/electron/electron/releases/download/v${electronVersion}/electron-v${electronVersion}-linux-x64.zip`;

  run(`rm -rf "${path.join(projectRoot, "node_modules/electron/dist")}"`);
  mkdirSync(path.join(projectRoot, "node_modules/electron/dist"), {
    recursive: true,
  });
  run(`curl -L -o "${electronZip}" "${electronUrl}"`);
  run(
    `unzip -o "${electronZip}" -d "${path.join(projectRoot, "node_modules/electron/dist")}"`
  );
  writeFileSync(
    path.join(projectRoot, "node_modules/electron/path.txt"),
    "electron"
  );
  run(`rm -f "${electronZip}"`);

  restoreCustomResources();

  if (existsSync(customResourcesBackup)) {
    rmSync(customResourcesBackup, { recursive: true });
  }

  console.log("\n🛠️ Construindo nativo...");
  run("yarn build:native");

  setupPythonEnv();

  console.log("\n⬇️ Baixando ludusavi...");
  run("node ./scripts/postinstall.cjs");

  console.log("\n🏗️ Compilando o app...");
  run("yarn build");

  console.log("\n🔧 Corrigindo permissões...");
  if (os.userInfo().uid === 0) {
    run(
      `chown -R cas:cas "${projectRoot}/out" "${projectRoot}/node_modules/electron"`
    );
  } else {
    run(
      `chown -R ${os.userInfo().uid}:${os.userInfo().gid} "${projectRoot}/out" "${projectRoot}/node_modules/electron"`
    );
  }

  if (configBackup) {
    console.log("\n📂 Restaurando config.json...");
    writeFileSync("config.json", configBackup);
  }
  if (envBackup) {
    console.log("📂 Restaurando .env...");
    writeFileSync(".env", envBackup);
  }

  console.log("\n✅ Restore completo!");
};

const reinstallPackage = (packageName) => {
  console.log(`\n🔄 Reinstallando ${packageName}...`);
  run(`yarn add ${packageName}`);
  run("yarn build");
  console.log(`✅ ${packageName} reinstalado!`);
};

const args = process.argv.slice(2);
if (args.length > 0) {
  reinstallPackage(args[0]);
} else {
  restore();
}
