import path from 'path'
import unixify from 'unixify'
import { globbySync } from 'globby'
import { existsSync, lstatSync, readFileSync, Stats } from 'fs'
import { getPackagesSync, Packages } from '@manypkg/get-packages'
import { PackageJSON } from './types.js'

export function readManifest(path: string) {
  if (!existsSync(path)) {
    throw new ReferenceError(`package.json file not found: "${path}"`)
  }

  let stat: Stats
  try {
    stat = lstatSync(path)
  } catch (_) {
    throw new ReferenceError(`package.json cannot be read: "${path}"`)
  }

  if (!stat.isFile())
    throw new ReferenceError(`package.json is not a file: "${path}"`)

  try {
    return readFileSync(path, 'utf8')
  } catch (_) {
    throw new ReferenceError(`package.json cannot be read: "${path}"`)
  }
}

export function getManifest(path: string) {
  const content = readManifest(path)
  let manifest: PackageJSON
  try {
    manifest = JSON.parse(content)
  } catch (_) {
    throw new SyntaxError(`package.json could not be parsed: "${path}"`)
  }

  if (typeof manifest !== 'object') {
    throw new SyntaxError(`package.json was not an object: "${path}"`)
  }

  if (typeof manifest.name !== 'string' || !manifest.name.length) {
    throw new SyntaxError(`Package name must be non-empty string: "${path}"`)
  }

  const checkDeps = (
    scope:
      | 'dependencies'
      | 'devDependencies'
      | 'peerDependencies'
      | 'optionalDependencies',
  ) => {
    if (
      Object.prototype.hasOwnProperty.call(manifest, scope) &&
      typeof manifest[scope] !== 'object'
    ) {
      throw new SyntaxError(`Package ${scope} must be object: "${path}"`)
    }
  }

  checkDeps('dependencies')
  checkDeps('devDependencies')
  checkDeps('peerDependencies')
  checkDeps('optionalDependencies')

  Object.defineProperty(manifest, '__contents__', {
    enumerable: false,
    value: content,
  })

  return manifest
}

export function getManifestPaths(cwd: string, ignorePackages?: string[]) {
  let workspace: Packages
  try {
    workspace = getPackagesSync(cwd)
  } catch (e) {
    console.warn(e)
    workspace = {
      tool: 'root',
      root: {
        dir: cwd,
        packageJson: getManifest(path.join(cwd, 'package.json')),
      },
      packages: [],
    }
  }

  const packages = workspace.packages.map((p) => path.relative(cwd, p.dir))
  if (ignorePackages) {
    packages.push(...ignorePackages.map((p) => `!${p}`))
  }

  const workspacePackagePaths = globbySync(
    packages.map((p) => unixify(p)), // convert Windows file paths to unix paths
    {
      cwd,
      onlyFiles: true,
      absolute: true,
      gitignore: true,
      deep: 1,
    },
  ).filter((f) => /\/package\.json$/.test(f))

  if (!workspacePackagePaths.length) {
    throw new TypeError('Project must contain one or more workspace-packages')
  }

  return workspacePackagePaths
}
