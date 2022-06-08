import { execaSync, SyncOptions, execa, Options } from 'execa'

/**
 * Get all the tags for a given branch.
 *
 * @param branch The branch for which to retrieve the tags.
 * @param execaOptions Options to pass to `execa`.
 * @param filters List of prefixes/sufixes to be checked inside tags.
 */
export function getTags(
  branch: string,
  execaOptions: SyncOptions,
  filters?: string[],
) {
  const raw = execaSync('git', ['tag', '--merged', branch], execaOptions).stdout
  const tags = raw
    .split('\n')
    .map((tag) => tag.trim())
    .filter(Boolean)

  if (!filters || !filters.length) {
    return tags
  }

  return tags.filter((tag) => !!filters.find((v) => tag.includes(v)))
}

/**
 * Get the commit sha for a given tag.
 *
 * @param tagName Tag name for which to retrieve the commit sha.
 * @param execaOptions Options to pass to `execa`.
 */
export async function getTagHead(tagName: string, execaOptions: Options) {
  return (await execa('git', ['rev-list', '-1', tagName], execaOptions)).stdout
}
