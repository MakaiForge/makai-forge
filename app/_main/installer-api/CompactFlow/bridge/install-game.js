#!/usr/bin/env node
const { callApi, takeSnapshot, scanPrefixForExes, isInstallerExe, runInstaller, copyToPrefix, extractInnoSetup, extractNsis, classifyExe, main } = require('./install-game/index');
const { installDepToPrefix, installRequiredDeps, isDepInstalled, BUILTIN_DEPS } = require('./deps-manager');

module.exports = {
  callApi, takeSnapshot, scanPrefixForExes, isInstallerExe,
  runInstaller, copyToPrefix, extractInnoSetup, extractNsis, classifyExe,
  installDepToPrefix, installRequiredDeps, isDepInstalled, BUILTIN_DEPS, main,
};

if (require.main === module) {
  main();
}
