const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { COMPAT_DIR } = require('./installed');

function installProton(tagName, downloadUrl) {
  if (!fs.existsSync(COMPAT_DIR)) {
    fs.mkdirSync(COMPAT_DIR, { recursive: true });
  }

  const fileName = path.basename(downloadUrl);
  const downloadPath = path.join('/tmp', fileName);

  console.log(`Baixando ${fileName}...`);

  try {
    execSync(`wget -q --show-progress "${downloadUrl}" -O "${downloadPath}"`, {
      stdio: 'inherit', timeout: 600000,
    });
  } catch (e) {
    throw new Error(`Falha no download: ${e.message}`);
  }

  console.log('Extraindo...');

  try {
    if (fileName.endsWith('.tar.gz')) {
      execSync(`tar -xzf "${downloadPath}" -C "${COMPAT_DIR}"`, { stdio: 'inherit', timeout: 120000 });
    } else if (fileName.endsWith('.tar.xz')) {
      execSync(`tar -xJf "${downloadPath}" -C "${COMPAT_DIR}"`, { stdio: 'inherit', timeout: 120000 });
    } else {
      execSync(`unzip -o "${downloadPath}" -d "${COMPAT_DIR}"`, { stdio: 'inherit', timeout: 120000 });
    }
  } catch (e) {
    throw new Error(`Falha na extração: ${e.message}`);
  }

  try { fs.unlinkSync(downloadPath); } catch {}

  console.log(`Instalado em ${COMPAT_DIR}`);
  return tagName;
}

module.exports = { installProton };
