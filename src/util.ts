import { cosmiconfig } from 'cosmiconfig'
import { normalize, isAbsolute, join } from 'path'
import semanticRelease from 'semantic-release'
import { check } from './blork'

export namespace Util {
  /**
   * Normalize and make a path absolute, optionally using a custom CWD.
   * Trims any trailing slashes from the path.
   */
  export function cleanPath(path: string, cwd = process.cwd()) {
    check(path, 'path: path')
    check(cwd, 'cwd: absolute')

    const abs = isAbsolute(path) ? path : join(cwd, path)
    return normalize(abs).replace(/[/\\]+$/, '')
  }

  const CONFIG_NAME = 'release'
  const CONFIG_FILES = [
    'package.json',
    `.${CONFIG_NAME}rc`,
    `.${CONFIG_NAME}rc.json`,
    `.${CONFIG_NAME}rc.yaml`,
    `.${CONFIG_NAME}rc.yml`,
    `.${CONFIG_NAME}rc.js`,
    `${CONFIG_NAME}.config.js`,
  ]

  /**
   * Get the release configuration options for a given directory.
   * Unfortunately we've had to copy this over from semantic-release, creating unnecessary duplication.
   */
  export async function getConfig(
    cwd: string,
  ): Promise<semanticRelease.Options> {
    const config = await cosmiconfig(CONFIG_NAME, {
      searchPlaces: CONFIG_FILES,
    }).search(cwd)

    // Return the found config or empty object.
    // istanbul ignore next (not important).
    return config ? config.config : {}
  }
}
