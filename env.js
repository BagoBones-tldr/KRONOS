let loaded = false;

function loadEnv() {
  if (loaded) {
    return;
  }

  require('dotenv').config({ quiet: true });
  loaded = true;
}

module.exports = {
  loadEnv
};
