import path from 'path'
import getStream from 'get-stream'
import gitLogParser from 'git-log-parser'
import { execa } from 'execa'
import { Commit } from './types.js'
import { getDebugger } from './debugger.js'
import { toAbsolutePath } from './util.js'
import { check, ValueError } from './blork.js'

const debug = getDebugger('commits')

/**
 * Retrieve the list of commits on the current branch since the commit sha
 * associated with the last release, or all the commits of the current branch
 * if there is no last released version. Commits are filtered to only return
 * those that corresponding to the package directory.
 *
 * @param cwd Absolute path of the working directory the Git repo is in.
 * @param dir Path to the target directory to filter by. Either absolute, or
 *            relative to cwd param.
 * @param lastRelease The SHA of the previous release (default to start of all
 *                    commits if undefined)
 * @param nextRelease The SHA of the next release (default to HEAD if undefined)
 * @param firstParentBranch first-parent to determine which merge into master
 */
export async function getFilteredCommits(
  cwd: string,
  dir: string,
  lastRelease?: string,
  nextRelease?: string,
  firstParentBranch?: string,
) {
  check(cwd, 'cwd: directory')
  check(dir, 'dir: path')

  cwd = toAbsolutePath(cwd) // eslint-disable-line no-param-reassign
  dir = toAbsolutePath(dir, cwd) // eslint-disable-line no-param-reassign

  check(dir, 'dir: directory')
  check(lastRelease, 'lastRelease: alphanumeric{40}?')
  check(nextRelease, 'nextRelease: alphanumeric{40}?')

  if (dir.indexOf(cwd) !== 0) {
    throw new ValueError('dir: Must be inside cwd', dir)
  }

  if (dir === cwd) {
    throw new ValueError('dir: Must not be equal to cwd', dir)
  }

  // Get top-level Git directory as it might be higher up the tree than cwd.
  const root = (await execa('git', ['rev-parse', '--show-toplevel'], { cwd }))
    .stdout

  // Add correct fields to gitLogParser.
  Object.assign(gitLogParser.fields, {
    hash: 'H',
    message: 'B',
    gitTags: 'd',
    committerDate: { key: 'ci', type: Date },
  })

  // Use git-log-parser to get the commits.
  const relpath = path.relative(root, dir)
  const firstParentBranchFilter = firstParentBranch
    ? ['--first-parent', firstParentBranch]
    : []
  const range =
    (lastRelease ? `${lastRelease}..` : '') + (nextRelease || 'HEAD')
  const gitLogFilterQuery = [...firstParentBranchFilter, range, '--', relpath]
  const stream = gitLogParser.parse(
    { _: gitLogFilterQuery },
    { cwd, env: process.env },
  )
  const commits: Commit[] = await getStream.array(stream)
  commits.forEach((commit) => {
    commit.message = commit.message.trim()
    commit.gitTags = commit.gitTags.trim()
  })

  debug('git log filter query: %o', gitLogFilterQuery)
  debug('filtered commits: %O', commits)

  return commits
}
