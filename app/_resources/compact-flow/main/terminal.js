const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');

function findTerminal() {
  const env = process.env.TERMINAL;
  if (env && fs.existsSync(env)) return env;

  try {
    const kde = execSync(
      'kreadconfig6 --file kdeglobals --group General --key TerminalApplication',
      { encoding: 'utf-8', timeout: 3000 }
    ).trim();
    if (kde) {
      const p = kde.startsWith('/') ? kde : `/usr/bin/${kde}`;
      if (fs.existsSync(p)) return p;
    }
  } catch {}

  const check = (p) => fs.existsSync(p) ? p : null;

  const result = check('/usr/bin/x-terminal-emulator');
  if (result) return result;

  const list = [
    '/usr/bin/konsole', '/usr/bin/kitty', '/usr/bin/gnome-terminal',
    '/usr/bin/xfce4-terminal', '/usr/bin/lxterminal', '/usr/bin/alacritty',
    '/usr/bin/terminator', '/usr/bin/urxvt', '/usr/bin/xterm',
  ];
  for (const p of list) {
    const r = check(p);
    if (r) return r;
  }
  return null;
}

const TERMINAL_CMDS = {
  konsole:         (c) => ['--hold', '-e', 'bash', '-c', c],
  kitty:           (c) => ['-e', 'bash', '-c', c],
  'gnome-terminal': (c) => ['--', 'bash', '-c', c],
  'xfce4-terminal': (c) => ['--hold', '-e', 'bash', '-c', c],
  lxterminal:      (c) => ['-e', 'bash', '-c', c],
  alacritty:       (c) => ['-e', 'bash', '-c', c],
  terminator:      (c) => ['-e', 'bash', '-c', c],
  urxvt:           (c) => ['-hold', '-e', 'bash', '-c', c],
  xterm:           (c) => ['-hold', '-e', 'bash', '-c', c],
};

function openTerminal(command) {
  const term = findTerminal();
  if (!term) return false;
  const name = path.basename(term);
  const wrapper = `${command}; echo; read -p 'Pressione Enter para fechar...'`;
  const argsFn = TERMINAL_CMDS[name];
  const args = argsFn ? argsFn(wrapper) : ['-e', 'bash', '-c', wrapper];
  try {
    spawn(term, args, { detached: true, stdio: 'ignore' }).unref();
    return true;
  } catch { return false; }
}

module.exports = { findTerminal, openTerminal };
