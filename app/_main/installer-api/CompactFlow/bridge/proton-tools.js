#!/usr/bin/env node
const { listInstalled, listAvailable, listForks, installProton, rateReleases } = require('./proton/index');

module.exports = { listInstalled, listAvailable, listForks, installProton, rateReleases };

if (require.main === module) {
  const cmd = process.argv[2];
  if (cmd === 'list') {
    console.log(JSON.stringify(listInstalled(), null, 2));
  } else if (cmd === 'available') {
    console.log(JSON.stringify(listAvailable(), null, 2));
  } else if (cmd === 'forks') {
    try {
      const forks = listForks();
      console.log(JSON.stringify(forks, null, 2));
    } catch (e) {
      console.error(JSON.stringify({ success: false, error: e.message }));
      process.exit(1);
    }
  } else if (cmd === 'ratings') {
    try {
      const releases = JSON.parse(process.argv[3] || '[]');
      const result = rateReleases(releases);
      console.log(JSON.stringify(result, null, 2));
    } catch (e) {
      console.error(JSON.stringify({ success: false, error: e.message }));
      process.exit(1);
    }
  } else if (cmd === 'install') {
    const tag = process.argv[3];
    const url = process.argv[4];
    if (!tag || !url) {
      console.error('Usage: node proton-tools.js install <tag> <download_url>');
      process.exit(1);
    }
    try {
      const result = installProton(tag, url);
      console.log(JSON.stringify({ success: true, version: result }));
    } catch (e) {
      console.error(JSON.stringify({ success: false, error: e.message }));
      process.exit(1);
    }
  } else {
    console.log('Usage: proton-tools.js <list|available|forks|ratings|install>');
    process.exit(1);
  }
}
