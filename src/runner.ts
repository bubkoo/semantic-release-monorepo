import debug from 'debug'
import semrelPkg from 'semantic-release/package.json'
import pkg from '../package.json'
import { Options } from './types'
import { Release } from './release'
import { Workspace } from './workspace'

export function release(options: Options = {}) {
  if (options.debug) {
    debug.enable('msr:*')
  }

  const cwd = process.cwd()
  try {
    console.log(`multi-semantic-release version: ${pkg.version}`)
    console.log(`semantic-release version: ${semrelPkg.version}`)
    console.log(`flags: ${JSON.stringify(options, null, 2)}`)

    const paths = Workspace.get(cwd)
    console.log('yarn paths', paths)

    Release.start(paths, {}, { cwd }, options).then(
      () => {
        process.exit(0)
      },
      (error) => {
        console.error(`[multi-semantic-release]:`, error)
        process.exit(1)
      },
    )
  } catch (error) {
    console.error(`[multi-semantic-release]:`, error)
    process.exit(1)
  }
}
