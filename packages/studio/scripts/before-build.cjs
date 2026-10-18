// electron-builder hook: Studio bundles all its code into out/, so there are no node_modules
// to collect or rebuild. Returning false tells electron-builder to skip both.
exports.default = async function beforeBuild() {
  return false;
};
