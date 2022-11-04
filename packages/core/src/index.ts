import 'dotenv/config'
import path from 'path'
import { fileURLToPath } from 'url'
import SemanticRelease from 'semantic-release'
import { getLogger } from './logger.js'
import { releasePackages } from './release.js'
import { Context, SRMOptions } from './types.js'
import { getManifest, getManifestPaths } from './manifest.js'
import { enableDebugger, getDebugger } from './debugger.js'

const debug = getDebugger('options')
function release(
  srmOptions: SRMOptions = {},
  srOptions: SemanticRelease.Options = {},
  context: Context = {
    cwd: process.cwd(),
    env: process.env as { [name: string]: string },
    stdout: process.stdout,
    stderr: process.stderr,
  },
) {
  srmOptions.deps = {
    bump: 'inherit',
    ...srmOptions.deps,
  }

  enableDebugger(srmOptions.debug)
  const logger = getLogger(context)
  const filename = fileURLToPath(import.meta.url)
  const dirname = path.dirname(filename)
  const srmPkgJSON = getManifest(path.resolve(dirname, `../package.json`))

  try {
    logger.info(`Running srm version ${srmPkgJSON.version}`)
    logger.info(`Load packages from: ${context.cwd}`)

    debug(`srm options: ${JSON.stringify(srmOptions, null, 2)}`)

    const paths = getManifestPaths(context.cwd, srmOptions.ignorePackages)
    releasePackages(paths, srOptions, srmOptions, context, logger).then(
      () => {
        process.exit(0)
      },
      (error) => {
        logger.error(`[srm]:`, error)
        process.exit(1)
      },
    )
  } catch (error) {
    logger.error(`[srm]:`, error)
    process.exit(1)
  }
}

export { SRMOptions }
export { release }

export default release
