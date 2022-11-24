import _ from 'lodash'
import SemanticRelease from 'semantic-release'
import { writeFileSync } from 'fs'
import { getManifest } from './manifest.js'
import {
  SRMOptions,
  Package,
  PackageJSON,
  BumpStrategy,
  VersionPrefix,
} from './types.js'
import { getDebugger } from './debugger.js'
import { detectFormat } from './util.js'
import { Synchronizer } from './synchronizer.js'
import {
  getNextVersion,
  getNextPreVersion,
  resolveNextVersion,
} from './semver.js'

const debug = getDebugger('deps')

/**
 * Resolve package release type taking into account the dependencies update.
 *
 * @param pkg Package object
 * @param bumpStrategy Dependency resolution strategy
 * @param releaseType Release type triggered by deps updating:
 *          - `patch`, `minor`, `major` — strictly declare the release type
 *            that occurs when any dependency is updated.
 *          - `inherit` — applies the "highest" release of updated deps to
 *            the package. For example, if any dep has a breaking change,
 *            `major` release will be applied to all dependants up the chain.
 * @param versionPrefix Dependency version prefix to be attached
 *               if `bumpStrategy='override'`
 * @returns Resolved release type
 */
function resolveReleaseType(
  pkg: Package,
  bumpStrategy: BumpStrategy = 'override',
  releaseType: 'patch' | 'minor' | 'major' | 'inherit' = 'patch',
  versionPrefix: VersionPrefix = '',
): SemanticRelease.ReleaseType | undefined {
  // create a list of dependencies that require change to the manifest
  pkg.localDepsChanged = pkg.localDeps.filter((d: Package) =>
    isDependencyUpdated(pkg, d, bumpStrategy, versionPrefix),
  )

  // Check if any dependencies have changed.
  // If not return the current type of release.
  if (
    // not released yet
    !pkg.lastRelease ||
    // no deps available
    pkg.localDepsChanged.length === 0 ||
    // no new deps or deps upgraded
    pkg.localDepsChanged.every(
      (dep: Package) => dep.lastRelease && !dep.nextType,
    )
  ) {
    return pkg.nextType
  }

  // Return the highest release type if strategy is inherit
  if (releaseType === 'inherit') {
    return getHighestReleaseType(
      pkg.nextType!,
      ...pkg.localDepsChanged.map((d: Package) => d.nextType!),
    )
  }

  return getHighestReleaseType(pkg.nextType!, releaseType)
}

/**
 * Returns the 'highest' type of release, major > minor > patch > undefined.
 */
function getHighestReleaseType(...releaseTypes: SemanticRelease.ReleaseType[]) {
  return ['major', 'minor', 'patch'].find((type: SemanticRelease.ReleaseType) =>
    releaseTypes.includes(type),
  ) as SemanticRelease.ReleaseType
}

/**
 * Indicates if the manifest file requires a change for the given dependency
 */
function isDependencyUpdated(
  pkg: Package,
  dep: Package,
  bumpStrategy: BumpStrategy,
  versionPrefix: VersionPrefix,
) {
  const depLastVersion = dep.lastRelease && dep.lastRelease.version

  // Check if dependency was released before. If not, this is assumed to be a
  // new package + dependency
  const wasReleased = depLastVersion != null
  if (!wasReleased) {
    return true
  }

  // Get next version of dependency (which is lastVersion if no change expected)
  const depNextVersion = dep.nextType
    ? dep.preRelease
      ? getNextPreVersion(dep)
      : getNextVersion(dep)
    : depLastVersion

  // Get list of manifest dependencies
  const {
    dependencies = {},
    devDependencies = {},
    peerDependencies = {},
    optionalDependencies = {},
  } = pkg.manifest
  const scopes = [
    dependencies,
    devDependencies,
    peerDependencies,
    optionalDependencies,
  ]

  const requireUpdate = scopes.some((scope) =>
    isDependencyUpdatedWithScope(
      scope,
      dep.name,
      depNextVersion,
      bumpStrategy,
      versionPrefix,
    ),
  )

  return requireUpdate
}

/**
 * Checks if an update of a package is necessary in the given list of deps
 */
function isDependencyUpdatedWithScope(
  scope: { [key: string]: string },
  depName: string,
  depNextVersion: string,
  bumpStrategy: BumpStrategy,
  versionPrefix: VersionPrefix,
) {
  const depCurrVersion = scope[depName]
  if (!depNextVersion || !depCurrVersion) {
    return false
  }

  const resolvedVersion = resolveNextVersion(
    depCurrVersion,
    depNextVersion,
    bumpStrategy,
    versionPrefix,
  )

  return depCurrVersion !== resolvedVersion
}

export function updateManifestDeps(
  pkg: Package,
  writeOut = true,
  bumpStrategy: BumpStrategy = 'override',
  versionPrefix: VersionPrefix = '',
) {
  const { manifest, path } = pkg

  // Loop through changed deps to verify release consistency.
  pkg.localDepsChanged.forEach((dep) => {
    // Get version of dependency.
    const release = dep.nextRelease || dep.lastRelease

    // Cannot establish version.
    if (!release || !release.version)
      throw Error(
        `Cannot release because dependency ${dep.name} has not been released`,
      )

    // update changed dependencies
    const {
      dependencies = {},
      devDependencies = {},
      peerDependencies = {},
      optionalDependencies = {},
    } = manifest
    const scopes = [
      dependencies,
      devDependencies,
      peerDependencies,
      optionalDependencies,
    ]
    scopes.forEach((scope) => {
      if (scope[dep.name]) {
        scope[dep.name] = resolveNextVersion(
          scope[dep.name],
          release.version,
          bumpStrategy,
          versionPrefix,
        )
      }
    })
  })

  if (!writeOut || !shouldUpdateManifest(manifest, path)) {
    return
  }

  // update packageon
  const { indent, trailingWhitespace } = detectFormat(
    // eslint-disable-next-line no-underscore-dangle
    (manifest as any).__contents__,
  )
  writeFileSync(
    path,
    JSON.stringify(manifest, null, indent) + trailingWhitespace,
  )
}

// https://gist.github.com/Yimiprod/7ee176597fef230d1451
const difference = (object: object, base: object) =>
  _.transform(
    object,
    (result, value, key) => {
      if (!_.isEqual(value, base[key])) {
        result[key] =
          _.isObject(value) && _.isObject(base[key])
            ? difference(value, base[key])
            : `${base[key]} → ${value}`
      }
    },
    {} as Record<string, any>,
  )

function shouldUpdateManifest(actualManifest: PackageJSON, path: string) {
  const oldManifest = getManifest(path)
  const depScopes = [
    'dependencies',
    'devDependencies',
    'peerDependencies',
    'optionalDependencies',
  ] as const
  const changes = depScopes.reduce<any>((res, scope) => {
    const diff = difference(
      actualManifest[scope] || {},
      oldManifest[scope] || {},
    )

    if (Object.keys(diff).length) {
      res[scope] = diff
    }

    return res
  }, {})

  const debugPrefix = `[${actualManifest.name}]`
  debug(debugPrefix, 'package.json path=', path)

  if (Object.keys(changes).length) {
    debug(debugPrefix, 'changes=', changes)
    return true
  }

  debug(debugPrefix, 'no deps changes')
  return false
}

export async function updateNextReleaseType(
  pkg: Package,
  packages: Package[],
  synchronizer: Synchronizer,
  srmOptions: SRMOptions,
) {
  // Go in rounds to check for dependency changes that impact the release
  // type until no changes are found in any of the packages. Doing this in
  // rounds will have the changes "bubble-up" in the dependency graph until
  // all have been processed.

  if (pkg.localDepsChecking == null) {
    pkg.localDepsChecking = {}
  }

  let counter = 0
  let stable = false
  while (!stable) {
    const key = `depsCheck_${counter}`
    const rule = srmOptions.deps || {}
    const nextType = resolveReleaseType(
      pkg,
      rule.bump,
      rule.release,
      rule.prefix,
    )

    // indicate if it changed
    pkg.localDepsChecking[key] = pkg.nextType === nextType
    pkg.nextType = nextType

    // eslint-disable-next-line no-await-in-loop
    await synchronizer.waitForAll(
      key as any,
      (pkg: Package) =>
        pkg.localDepsChecking != null && pkg.localDepsChecking[key] != null,
    )

    stable = packages.every(
      (pkg: Package) =>
        pkg.localDepsChecking != null && pkg.localDepsChecking[key] === true,
    )
    counter += 1
  }
}
