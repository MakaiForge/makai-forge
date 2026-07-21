const fs = require('fs');

function detectDistro() {
  try {
    const raw = fs.readFileSync('/etc/os-release', 'utf-8');
    let id = '', idLike = '', name = '';
    for (const line of raw.split('\n')) {
      if (line.startsWith('ID=')) id = line.slice(3).replace(/"/g, '').trim();
      if (line.startsWith('ID_LIKE=')) idLike = line.slice(8).replace(/"/g, '').trim();
      if (line.startsWith('PRETTY_NAME=')) name = line.slice(12).replace(/"/g, '').trim();
    }
    return { id, idLike, name };
  } catch {
    return { id: 'unknown', idLike: '', name: 'Linux' };
  }
}

function getInstallCmd(pkg) {
  const { id, idLike } = detectDistro();
  const all = [id, ...idLike.split(/\s+/)].filter(Boolean);

  if (all.some(x => ['arch', 'artix', 'endeavouros', 'cachyos'].includes(x)))
    return `sudo pacman -S --noconfirm ${pkg}`;
  if (all.some(x => ['fedora', 'rhel', 'centos'].includes(x)))
    return `sudo dnf install -y ${pkg}`;
  if (all.some(x => ['debian', 'ubuntu', 'pop', 'linuxmint', 'zorin', 'elementary'].includes(x)))
    return `sudo apt install -y ${pkg}`;
  if (all.some(x => ['opensuse', 'suse'].includes(x)))
    return `sudo zypper install -y ${pkg}`;
  if (all.some(x => ['void'].includes(x)))
    return `sudo xbps-install -y ${pkg}`;
  if (all.some(x => ['gentoo', 'funtoo'].includes(x)))
    return `sudo emerge -a ${pkg}`;
  if (all.some(x => ['alpine'].includes(x)))
    return `sudo apk add ${pkg}`;
  if (all.some(x => ['nixos'].includes(x)))
    return `nix-env -iA nixos.${pkg}`;
  if (all.some(x => ['solus'].includes(x)))
    return `sudo eopkg install ${pkg}`;
  if (all.some(x => ['slackware'].includes(x)))
    return `sudo slackpkg install ${pkg}`;

  return `sudo pacman -S ${pkg}`;
}

function getDistroInfo() {
  const distro = detectDistro();
  return {
    name: distro.name || 'Linux',
    id: distro.id,
    idLike: distro.idLike,
    arch: process.arch,
  };
}

module.exports = { detectDistro, getInstallCmd, getDistroInfo };
