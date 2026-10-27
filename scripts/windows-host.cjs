// Compatibility for Windows hosts whose async realpath rejects allowed paths.
// The synchronous OS operation resolves the same path and observes the same access rules.
const fs = require('node:fs');
fs.promises.realpath = async function(path, options) { return fs.realpathSync(path, options); };
