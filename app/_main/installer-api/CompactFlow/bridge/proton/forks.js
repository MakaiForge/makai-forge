const { callApi } = require('../api');

function listForks() {
  return callApi('list_available_forks', {}, 30000);
}

function rateReleases(releases) {
  return callApi('rate_releases', { releases }, 30000);
}

module.exports = { listForks, rateReleases };
