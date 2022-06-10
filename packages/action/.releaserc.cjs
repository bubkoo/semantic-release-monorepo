const config = require('../../.releaserc.cjs')
const plugins = config.plugins.slice()
const index = plugins.indexOf('@semantic-release/npm')

plugins[index] = [
  plugins[index],
  {
    /**
     * Whether to publish the npm package to the registry. If `false` the
     * `package.json` version will still be updated.
     */
    npmPublish: false,
  },
]

module.exports = {
  ...config,
  plugins,
}
