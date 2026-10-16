const path = require('path');

// En Vercel el sistema de archivos es de solo lectura salvo /tmp, que además es efímero y propio de cada instancia.
const DOWNLOADS_DIR = process.env.VERCEL
  ? '/tmp/softmusic-downloads'
  : path.join(__dirname, '../../downloads');

module.exports = { DOWNLOADS_DIR };
