const { Transform } = require('stream');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const glob = require('glob');
const PluginError = require('plugin-error');

const PLUGIN_NAME = 'gulp-newer';
const globPromise = promisify(glob);
const statPromise = promisify(fs.stat);

class Newer extends Transform {
  constructor(options) {
    super({ objectMode: true });

    if (!options || (typeof options !== 'string' && !options.dest && !options.map)) {
      throw new PluginError(PLUGIN_NAME, 'Requires a destination path or a map function');
    }

    this._dest = typeof options === 'string' ? options : options.dest;
    this._ext = options.ext || '';
    this._map = options.map;
    this._timestamp = options.ctime ? 'ctime' : 'mtime';
    this._all = false;
    this._bufferedFiles = [];
  }

  async _transform(srcFile, encoding, done) {
    try {
      if (!srcFile || !srcFile.stat) {
        return done(new PluginError(PLUGIN_NAME, 'Expected a source file with stats'));
      }

      const relative = srcFile.relative;
      const ext = path.extname(relative);
      let destFile = this._ext ? relative.replace(ext, this._ext) : relative;
      if (this._map) destFile = this._map(destFile);
      const destPath = path.join(this._dest, destFile);

      let destStat;
      try {
        destStat = await statPromise(destPath);
      } catch (err) {
        if (err.code !== 'ENOENT') throw err;
      }

      const isNewer = !destStat || srcFile.stat[this._timestamp] > destStat[this._timestamp];
      if (this._all || isNewer) {
        if (!this._all && this._bufferedFiles.length) {
          this._bufferedFiles.forEach(file => this.push(file));
          this._bufferedFiles = [];
          this._all = true;
        }
        this.push(srcFile);
      } else {
        this._bufferedFiles.push(srcFile);
      }
      done();
    } catch (err) {
      done(new PluginError(PLUGIN_NAME, err));
    }
  }

  _flush(done) {
    this._bufferedFiles = null;
    done();
  }
}

module.exports = options => new Newer(options);
