import SemanticRelease from 'semantic-release'
import { PackageJSON } from '@changesets/types'

export type { PackageJSON }

export interface Logger {
  log: (message: string, ...vars: any[]) => void
  error: (message: string, ...vars: any[]) => void
}

export interface Options extends SemanticRelease.Options {
  pkgOptions: SemanticRelease.Options
}

export interface Package {
  name: string
  path: string
  dir: string
  manifest: PackageJSON
  deps: string[]
  localDeps: Package[]
  localDepsChanged: Package[]
  localDepsChecking?: { [key: string]: boolean }
  options: Options
  logger: Logger
  plugins: {
    verifyConditions: (context: VerifyConditionsPluginContext) => Promise<any>
    analyzeCommits: (
      context: AnalyzeCommitsContext,
    ) => Promise<SemanticRelease.ReleaseType>
    verifyRelease: (context: VerifyReleaseContext) => Promise<any>
    generateNotes: (context: GenerateNotesContext) => Promise<any>
    addChannel: (context: AddChannelContext) => Promise<any>
    prepare: (context: PrepareContext) => Promise<any>
    publish: (context: PublishContext) => Promise<any>
    successWithoutComment: (context: SuccessContext) => Promise<any>
    successWithoutReleaseNote: (context: SuccessContext) => Promise<any>
    fail: (context: FailContext) => Promise<any>
  }
  result?: SemanticRelease.Result

  branchName?: string
  nextType?: SemanticRelease.ReleaseType
  rawNextType?: SemanticRelease.ReleaseType
  preRelease?: string
  lastRelease?: SemanticRelease.LastRelease
  nextRelease?: SemanticRelease.NextRelease

  status: {
    ready?: boolean
    analyzed?: boolean
    depsUpdated?: boolean
    prepared?: boolean
    tagged?: boolean
    published?: boolean
  }
}

export interface Context {
  cwd: string
  env: { [name: string]: string }
  stdout: NodeJS.WriteStream
  stderr: NodeJS.WriteStream
}

export interface SRMContext extends Context {
  globalOptions: SemanticRelease.Options
  inputOptions: SemanticRelease.Options
}

/**
 * Define deps version update rule.
 * - `override` — replace any prev version with the next one.
 * - `satisfy`  — check the next pkg version against its current references.
 *   If it matches (`*` matches to any, `1.1.0` matches `1.1.x`, `1.5.0`
 *   matches to `^1.0.0` and so on) release will not be triggered, if not
 *   `override` strategy will be applied instead.
 * - `inherit` will try to follow the current declaration version/range.
 *   `~1.0.0` + `minor` turns into `~1.1.0`, `1.x` + `major` gives `2.x`, but
 *   `1.x` + `minor` gives `1.x` so there will be no release, etc.
 */
export type BumpStrategy = 'override' | 'satisfy' | 'inherit'
/**
 * Optional prefix to be attached to the next version if `--deps.bump` set to
 * `override`. Supported values: `^` | `~` | `''`(empty string)
 */
export type VersionPrefix = '^' | '~' | ''

export interface SRMOptions {
  /**
   * The objective of the dry-run mode is to get a preview of the pending
   * release. Dry-run mode skips the following steps: `prepare`, `publish`,
   * `success` and `fail`. In addition to this it prints the next version and
   * release notes to the console.
   *
   * Note: The Dry-run mode verifies the repository push permission, even though
   * nothing will be pushed. The verification is done to help user to figure out
   * potential configuration issues.
   */
  dryRun?: boolean
  /**
   * Output debugging information
   */
  debug?: boolean | string
  /**
   * Avoid hypothetical concurrent initialization collisions
   */
  sequential?: boolean
  /**
   * Apply commit filtering to current branch only
   */
  firstParent?: boolean
  /**
   * Packages list to be ignored on bumping process (append to the ones that
   * already exist at `package.json` workspaces)
   */
  ignorePackages?: string[]
  /**
   * Private packages will be ignored
   */
  ignorePrivatePackages?: boolean
  deps?: {
    bump?: BumpStrategy
    prefix?: VersionPrefix
    /**
     * Define release type for dependent package if any of its deps changes.
     * `patch`, `minor`, `major` — strictly declare the release type that
     * occurs when any dependency is updated; `inherit` — applies the "highest"
     * release of updated deps to the package. For example, if any dep has a
     * breaking change, `major` release will be applied to the all dependants
     * up the chain.
     */
    release?: 'patch' | 'minor' | 'major' | 'inherit'
  }
  /**
   * Publish to Github Package Registry
   */
  gpr?: boolean
  /**
   * The scope of Github Package Registry, default to the repo owner
   */
  gprScope?: string

  /**
   * The footer message in the `successComment` or `failComment` created by
   * "@semantic-release/github" plugin
   */
  commentFooter?: string
  proxyBranch?: string
}

export interface Commit extends SemanticRelease.Commit {
  gitTags: string
}

// @see https://github.com/semantic-release/semantic-release/blob/master/docs/developer-guide/plugin.md
export interface PluginOptions {
  [key: string]: any
}

type Branch = Exclude<SemanticRelease.BranchSpec, string>

export interface VerifyConditionsPluginContext {
  cwd: string
  env: { [name: string]: string }
  stdout: NodeJS.WriteStream
  stderr: NodeJS.WriteStream
  logger: Logger
  envCi: {
    /**
     * true if the environment is a CI environment
     */
    isCi: boolean
    /**
     * commit hash
     */
    commit: string
    /**
     * current branch
     */
    branch: string
    [key: string]: any
  }
  options: Options
  branch: Branch
  branches: Branch[]
}

export interface AnalyzeCommitsContext extends VerifyConditionsPluginContext {
  commits: Commit[]
  releases: SemanticRelease.Release[]
  lastRelease: SemanticRelease.LastRelease
  nextRelease?: SemanticRelease.NextRelease
}

export interface VerifyReleaseContext extends AnalyzeCommitsContext {
  nextRelease: SemanticRelease.NextRelease
}

export interface GenerateNotesContext extends VerifyReleaseContext {}

/**
 * `addChannel` run only if there are releases that have been merged from a
 * higher branch but not added on the channel of the current branch.
 */
export interface AddChannelContext extends VerifyReleaseContext {}

/**
 *
 */
export interface PrepareContext extends VerifyReleaseContext {}

export interface PublishContext extends VerifyReleaseContext {}

export interface SuccessContext extends VerifyReleaseContext {}

export interface FailContext extends VerifyReleaseContext {
  errors: any
}
