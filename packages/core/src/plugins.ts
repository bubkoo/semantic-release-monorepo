import _ from 'lodash'
import path from 'path'
import fse from 'fs-extra'
import gitOwner from 'git-username'
import SemanticRelease from 'semantic-release'
import { execa } from 'execa'
import {
  Package,
  SRMContext,
  SRMOptions,
  PluginOptions,
  PrepareContext,
  PublishContext,
  VerifyReleaseContext,
  GenerateNotesContext,
  AnalyzeCommitsContext,
  SuccessContext,
} from './types.js'
import { getTagHead } from './git.js'
import { getDebugger } from './debugger.js'
import { getRootPkgs } from './npm-pkg-root.js'
import { Synchronizer } from './synchronizer.js'
import { getFilteredCommits } from './commits.js'
import { updateManifestDeps, updateNextReleaseType } from './local-deps.js'
import { getManifest, readManifest } from './manifest.js'

const debug = getDebugger('plugins')

export type CreateInlinePlugins = ReturnType<typeof makeInlinePluginsCreator>

export function makeInlinePluginsCreator(
  packages: Package[],
  context: SRMContext,
  synchronizer: Synchronizer,
  srmOptions: SRMOptions,
) {
  const { cwd } = context

  const createInlinePlugins = (pkg: Package) => {
    const { plugins, dir, name } = pkg
    const releaseMap: { [key: string]: SemanticRelease.Release[] } = {}
    let succeedCount = 0

    const next = () => {
      pkg.status.tagged = true
      synchronizer.emit(
        'readyForTagging',
        synchronizer.find((pkg) => pkg.nextType != null && !pkg.status.tagged),
      )
    }

    const verifyConditions = async (
      pluginOptions: PluginOptions,
      context: VerifyReleaseContext,
    ) => {
      // Restore context for plugins that does not rely on parsed opts.
      Object.assign(context.options, context.options.pkgOptions)
      // Bind actual logger.
      Object.assign(pkg.logger, context.logger)

      pkg.status.ready = true
      synchronizer.emit(
        'readyForRelease',
        synchronizer.find((pkg) => !pkg.status.ready),
      )

      const res = await plugins.verifyConditions(context)
      debug('verified conditions: %s', pkg.name)
      return res
    }

    /**
     * Responsible for determining the type of the next release (major, minor
     * or patch). If multiple plugins with a analyzeCommits step are defined,
     * the release type will be the highest one among plugins output.
     *
     * Returns "patch" if the package contains references to other local
     * packages that have changed, or null if this package references no
     * local packages or they have not changed.
     *
     * Also updates the `context.commits` setting with one returned from
     * `getCommitsFiltered()` (which is filtered by package directory).
     */
    const analyzeCommits = async (
      pluginOptions: PluginOptions,
      context: AnalyzeCommitsContext,
    ) => {
      pkg.branchName = context.branch.name
      pkg.preRelease = context.branch.prerelease as string

      // Filter commits by directory.
      const firstParentBranch = srmOptions.firstParent
        ? context.branch.name
        : undefined
      const commits = await getFilteredCommits(
        cwd,
        dir,
        context.lastRelease ? context.lastRelease.gitHead : undefined,
        context.nextRelease ? context.nextRelease.gitHead : undefined,
        firstParentBranch,
      )

      // Update context.commits with fitered commits
      context.commits = commits

      pkg.lastRelease = context.lastRelease
      pkg.nextType = await plugins.analyzeCommits(context)
      pkg.rawNextType = pkg.nextType

      // Wait until all packages have been analyzed.
      pkg.status.analyzed = true
      await synchronizer.waitForAll(
        'analyzed',
        (pkg) => pkg.status.analyzed === true,
      )

      await updateNextReleaseType(pkg, packages, synchronizer, srmOptions)

      debug('commits analyzed: %s', pkg.name)
      debug('next release type [deps]: %s', pkg.rawNextType || '')
      debug('next release type  [raw]: %s', pkg.nextType || '')

      return pkg.nextType
    }

    /**
     * Responsible for generating the content of the release note. If
     * multiple plugins with a generateNotes step are defined, the release
     * notes will be the result of the concatenation of each plugin output.
     */
    const generateNotes = async (
      pluginOptions: PluginOptions,
      context: GenerateNotesContext,
    ) => {
      pkg.nextRelease = context.nextRelease
      // wait until `nextRelease` prop was set in all packages
      await synchronizer.waitForAll(
        'nextRelease',
        (pkg) => pkg.nextRelease != null,
        (pkg) => pkg.nextType != null,
      )

      const notes = []
      const { lastRelease, nextRelease } = context

      if (lastRelease && lastRelease.gitTag) {
        if (
          !lastRelease.gitHead ||
          lastRelease.gitHead === lastRelease.gitTag
        ) {
          lastRelease.gitHead = await getTagHead(lastRelease.gitTag, {
            cwd: context.cwd,
            env: context.env,
          })
        }
      }

      // Filter commits by directory (and release range)
      const firstParentBranch = srmOptions.firstParent
        ? context.branch.name
        : undefined
      const commits = await getFilteredCommits(
        cwd,
        dir,
        lastRelease ? lastRelease.gitHead : undefined,
        nextRelease ? nextRelease.gitHead : undefined,
        firstParentBranch,
      )

      context.commits = commits

      // Get subnotes and add to list.
      const subs = await plugins.generateNotes(context)
      if (subs) {
        // Inject pkg name into title if it matches e.g. `# 1.0.0` or
        // `## [1.0.1]` (as generate-release-notes does).
        notes.push(subs.replace(/^(#+) (\[?\d+\.\d+\.\d+\]?)/, `$1 ${name} $2`))
      }

      // If it has upgrades add an upgrades section.
      const upgrades = pkg.localDepsChanged.filter(
        (d) => d.nextRelease && d.nextRelease.version,
      )

      if (upgrades && upgrades.length > 0) {
        notes.push(`### Dependencies`)
        const bullets = upgrades.map(
          (d) => `* **${d.name}:** upgraded to ${d.nextRelease!.version}`,
        )
        notes.push(bullets.join('\n'))
      }

      debug('notes generated: %s', pkg.name)

      if (pkg.options.dryRun) {
        next()
      }

      return notes.join('\n\n')
    }

    const prepare = async (
      pluginOptions: PluginOptions,
      context: PrepareContext,
    ) => {
      // Wait until the current pkg is ready to be tagged
      synchronizer.getLucky('readyForTagging', pkg)
      await synchronizer.waitFor('readyForTagging', pkg)

      // Get all packages that potentially need to be updated
      const pkgs = _.uniqBy(
        [
          pkg,
          ...getRootPkgs(context, { localDepsChanged: pkg.localDepsChanged }),
        ],
        'path',
      )

      // Loop through each manifest and update its dependencies if needed
      pkgs.forEach((item) =>
        updateManifestDeps(
          item,
          true,
          srmOptions.deps ? srmOptions.deps.bump : undefined,
          srmOptions.deps ? srmOptions.deps.prefix : undefined,
        ),
      )

      pkg.status.depsUpdated = true
      const res = await plugins.prepare(context)
      pkg.status.prepared = true

      debug('prepared: %s', pkg.name)

      return res
    }

    const publishGPR = async (context: PublishContext) => {
      if (!pkg.manifest.private) {
        // Only Personal Access Token or GitHub Actions token can publish to GPR
        const token = context.env.GITHUB_TOKEN
        const host = 'npm.pkg.github.com'
        const registry = `https://${host}`
        const pkgPath = pkg.path
        const oldManifest = readManifest(pkgPath)
        const manifest = getManifest(pkgPath)

        // fix package name and publish registry
        let gprScope = srmOptions.gprScope || gitOwner()!
        debug(
          `Publish ${pkg.name} to Github Package Registry with scope ${gprScope}`,
        )
        if (gprScope[0] === '@') {
          gprScope = gprScope.substring(1)
        }

        const nameParts = manifest.name.split('/')
        const gprName =
          nameParts.length === 2
            ? `${nameParts[0].substring(1)}-${nameParts[1]}`
            : nameParts[0]
        manifest.name = `@${gprScope}/${gprName}`
        manifest.publishConfig = { registry, access: 'public' }

        const npmrcPath = path.join(path.dirname(pkgPath), '.npmrc')
        const hasNpmrc = await fse.pathExists(npmrcPath)
        const oldNpmrc = hasNpmrc ? await fse.readFile(npmrcPath) : null
        await fse.writeFile(
          npmrcPath,
          `@${gprScope}:registry=https://npm.pkg.github.com\n//${host}/:_authToken=${token}\nscripts-prepend-node-path=true`,
        )
        await fse.writeFile(pkgPath, JSON.stringify(manifest, null, 2))

        const pub = execa('npm', ['publish'], {
          cwd: pkg.dir,
          env: context.env,
        }) as any

        pub.stdout.pipe(context.stdout, { end: false })
        pub.stderr.pipe(context.stderr, { end: false })

        const ret = await pub

        await fse.writeFile(pkgPath, oldManifest)
        if (hasNpmrc) {
          await fse.writeFile(npmrcPath, oldNpmrc)
        } else {
          await fse.remove(npmrcPath)
        }

        return ret
      }
    }

    const publish = async (
      pluginOptions: PluginOptions,
      context: PublishContext,
    ) => {
      next()
      const res = await plugins.publish(context)
      const releases: SemanticRelease.Release[] = Array.isArray(res)
        ? res
        : res != null
        ? [res]
        : []

      if (srmOptions.gpr) {
        const gpr = await publishGPR(context)
        if (gpr && !gpr.failed) {
          const release = {
            ...context.nextRelease,
            name: 'GitHub package',
            url: `${context.options.repositoryUrl}/packages/`,
            pluginName: 'srm',
          }
          releases.push(release as SemanticRelease.Release)
        }
      }

      releaseMap[pkg.name] = releases
        .filter((r) => r.name != null)
        .map((r) => ({
          ...r,
          package: pkg.name,
          private: pkg.manifest.private,
          hasCommit: context.commits != null && context.commits.length > 0,
        }))

      debug('published: %s', pkg.name)

      return releases[0]
    }

    const success = async (
      pluginOptions: PluginOptions,
      context: SuccessContext,
    ) => {
      pkg.status.published = true
      await synchronizer.waitForAll(
        'published',
        (p: Package) => p.nextType != null,
      )

      context.releases = releaseMap[pkg.name]
      // Add release links to the GitHub Release, adding comments to
      // issue/pr was delayed
      const ret = await plugins.successWithoutComment(context)

      const totalCount = synchronizer
        .todo()
        .filter((p: Package) => p.nextType != null).length
      if (succeedCount < totalCount) {
        succeedCount += 1
      }

      debug('succeed: %s', pkg.name)
      debug(`progress: ${succeedCount}/${totalCount}`)

      if (succeedCount === totalCount) {
        debug('all released, comment issue/pr')
        const ctx = {
          ...context,
          releases: Object.keys(releaseMap)
            .sort()
            .reduce<SemanticRelease.Release[]>((arr, key) => {
              return [...arr, ...releaseMap[key]]
            }, []),
        }
        const shouldComment = ctx.releases.some(
          (release: any) => !release.private && release.hasCommit,
        )

        if (shouldComment) {
          await plugins.successWithoutReleaseNote(ctx)
        }
      }

      return ret
    }

    const inlinePlugin = {
      verifyConditions,
      analyzeCommits,
      generateNotes,
      prepare,
      publish,
      success,
    } as const

    // Add labels for logs.
    Object.keys(inlinePlugin).forEach((type: keyof typeof inlinePlugin) =>
      Reflect.defineProperty(inlinePlugin[type], 'pluginName', {
        value: 'srm inline plugin',
        writable: false,
        enumerable: true,
      }),
    )

    debug('inlinePlugin created: %s', pkg.name)

    return inlinePlugin
  }

  return createInlinePlugins
}