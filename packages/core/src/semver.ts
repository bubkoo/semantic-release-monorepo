import semver from 'semver'
import SemanticRelease from 'semantic-release'
import { getTags } from './git.js'
import { BumpStrategy, Package, VersionPrefix } from './types.js'

export function getNextVersion(pkg: Package) {
  const lastVersion = pkg.lastRelease && pkg.lastRelease.version
  return lastVersion && typeof pkg.nextType === 'string'
    ? semver.inc(lastVersion, pkg.nextType)!
    : lastVersion || '1.0.0'
}

/**
 * Resolve next package version on prereleases.
 *
 * @param pkg Package object.
 * @param tags Override list of tags from specific pkg and branch.
 * @returns Next pkg version.
 */
export function getNextPreVersion(pkg: Package, tags?: string[]) {
  const tagFilters = [pkg.preRelease as string]
  const lastVersion = pkg.lastRelease && pkg.lastRelease.version
  // Extract tags:
  // 1. Set filter to extract only package tags
  // 2. Get tags from a branch considering the filters established
  // 3. Resolve the versions from the tags
  // TODO: replace {cwd: '.'} with multiContext.cwd
  if (pkg.name) {
    tagFilters.push(pkg.name)
  }
  if (!tags || !tags.length) {
    // eslint-disable-next-line no-param-reassign
    tags = getTags(pkg.branchName!, { cwd: '.' }, tagFilters)
  }

  const lastPreRelTag = lastVersion ? getPreReleaseTag(lastVersion) : null
  const isNewPreRelease = lastPreRelTag && lastPreRelTag !== pkg.preRelease
  const nextVersion =
    isNewPreRelease || !lastVersion
      ? `1.0.0-${pkg.preRelease}.1`
      : getNextPreVersionCases(
          tags
            .map((tag) => getVersionFromTag(pkg, tag))
            .filter((v) => v != null) as string[],
          lastVersion,
          pkg.nextType!,
          pkg.preRelease!,
        )
  return nextVersion
}

/**
 * Resolve next prerelease special cases: highest version from tags or
 * major/minor/patch.
 *
 * @param tags List of all released tags from package.
 * @param lastVersion Last package version released.
 * @param nextType Next type evaluated for the next package type.
 * @param preRelease Package prerelease suffix.
 * @returns Next pkg version.
 */
function getNextPreVersionCases(
  tags: string[],
  lastVersion: string,
  nextType: SemanticRelease.ReleaseType,
  preRelease: string,
) {
  // Case 1: Normal release on last version and is now converted to a prerelease
  if (!semver.prerelease(lastVersion)) {
    const { major, minor, patch } = semver.parse(lastVersion)!
    return `${semver.inc(
      `${major}.${minor}.${patch}`,
      nextType || 'patch',
    )}-${preRelease}.1`
  }

  // Case 2: Validates version with tags
  const latestTag = getLatestVersion(tags, true)
  return getNextPreHighestVersion(latestTag, lastVersion, preRelease)
}

/**
 * Resolve next prerelease comparing bumped tags versions with last version.
 *
 * @param latestTag Last released tag from branch or null if non-existent.
 * @param lastVersion Last version released.
 * @param preRelease Prerelease tag from package to-be-released.
 * @returns Next pkg version.
 */
function getNextPreHighestVersion(
  latestTag: string,
  lastVersion: string,
  preRelease: string,
) {
  const bumpFromTags = latestTag
    ? semver.inc(latestTag, 'prerelease', preRelease)
    : null
  const bumpFromLast = semver.inc(lastVersion, 'prerelease', preRelease)!

  return bumpFromTags
    ? getHighestVersion(bumpFromLast, bumpFromTags)
    : bumpFromLast
}

/**
 * Parse the prerelease tag from a semver version.
 *
 * @param version Semver version in a string format.
 * @returns Version prerelease tag or null.
 */
function getPreReleaseTag(version: string) {
  const parsed = semver.parse(version)
  if (!parsed) return null
  return parsed.prerelease[0] || null
}

function getVersionFromTag(pkg: Package, tag?: string) {
  if (!pkg.name) {
    return tag || null
  }
  if (!tag) {
    return null
  }

  const matches = tag.match(/[0-9].[0-9].[0-9].*/)
  return matches && matches[0] && semver.valid(matches[0]) ? matches[0] : null
}

/**
 * Retrieve the latest version from a list of versions.
 */
function getLatestVersion(versions: string[], withPrerelease?: boolean) {
  return versions
    .filter((version) => withPrerelease || !semver.prerelease(version))
    .sort(semver.rcompare)[0]
}

function getVersionBy(
  predicate: (v1: string, v2: string) => boolean,
  version1: string,
  version2: string,
) {
  if (version1 && version2) {
    return predicate(version1, version2) ? version1 : version2
  }
  return version1 || version2
}

/**
 * Gets highest semver function binding gt to the HOC selectVersionBy.
 */
export const getHighestVersion = (version1: string, version2: string) =>
  getVersionBy(semver.gt, version1, version2)

/**
 * Gets lowest semver function binding gt to the HOC selectVersionBy.
 */
export const getLowestVersion = (version1: string, version2: string) =>
  getVersionBy(semver.lt, version1, version2)

export function resolveNextVersion(
  currentVersion: string,
  nextVersion: string,
  bumpStrategy: BumpStrategy,
  prefix: VersionPrefix,
) {
  // eslint-disable-next-line
  currentVersion = substituteWorkspaceVersion(currentVersion, nextVersion)

  if (currentVersion === nextVersion) {
    return currentVersion
  }

  // Check the next pkg version against its current references.
  // If it matches (
  //    `*` matches to any
  //    `1.1.0` matches `1.1.x`
  //    `1.5.0` matches to `^1.0.0`
  // and so on) release will not be triggered, if not `override` strategy
  // will be applied instead.
  if (
    (bumpStrategy === 'satisfy' || bumpStrategy === 'inherit') &&
    semver.satisfies(nextVersion, currentVersion)
  ) {
    return currentVersion
  }

  // `inherit` will try to follow the current declaration version/range.
  // `~1.0.0` + `minor` turns into `~1.1.0`, `1.x` + `major` gives `2.x`,
  // but `1.x` + `minor` gives `1.x` so there will be no release, etc.
  if (bumpStrategy === 'inherit') {
    const sep = '.'
    const nextChunks = nextVersion.split(sep)
    const currentChunks = currentVersion.split(sep)
    const resolvedChunks = currentChunks.map((chunk, i) =>
      nextChunks[i] ? chunk.replace(/\d+/, nextChunks[i]) : chunk,
    )

    return resolvedChunks.join(sep)
  }

  // "override"
  // By default next package version would be set as is for the all dependants.
  return prefix + nextVersion
}

/**
 * Substitute "workspace:" in currentVersion
 * See:
 * {@link https://yarnpkg.com/features/workspaces#publishing-workspaces}
 * {@link https://pnpm.io/workspaces#publishing-workspace-packages}
 *
 * @param {string} currentVersion Current version, may start with "workspace:"
 * @param {string} nextVersion Next version
 * @returns {string} current version without "workspace:"
 */
function substituteWorkspaceVersion(
  currentVersion: string,
  nextVersion: string,
) {
  if (currentVersion.startsWith('workspace:')) {
    const [, range, prefix] = /^workspace:(([\^~*])?.*)$/.exec(currentVersion)!

    return prefix === range
      ? prefix === '*'
        ? nextVersion
        : prefix + nextVersion
      : range
  }

  return currentVersion
}
