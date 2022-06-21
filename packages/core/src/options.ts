import SemanticRelease from 'semantic-release'
import { cosmiconfig } from 'cosmiconfig'

const CONFIG_NAME = 'release'
const CONFIG_FILES = [
  'package.json',
  `.${CONFIG_NAME}rc`,
  `.${CONFIG_NAME}rc.json`,
  `.${CONFIG_NAME}rc.yaml`,
  `.${CONFIG_NAME}rc.yml`,
  `.${CONFIG_NAME}rc.js`,
  `.${CONFIG_NAME}rc.cjs`,
  `${CONFIG_NAME}.config.js`,
  `${CONFIG_NAME}.config.cjs`,
]

export async function getOptions(
  cwd: string,
): Promise<SemanticRelease.Options> {
  const res = await cosmiconfig(CONFIG_NAME, {
    searchPlaces: CONFIG_FILES,
  }).search(cwd)

  return res ? res.config : {}
}

const MSR_HOME_URL = 'https://github.com/bubkoo/semantic-release-monorepo'
const DEFAULT_FOOTER = `Your **[semantic-release-monorepo](${MSR_HOME_URL})** bot base on **[semantic-release](https://github.com/semantic-release/semantic-release)** 💪💯`

export function getSuccessComment(footer?: string) {
  const footerMsg = footer || DEFAULT_FOOTER

  return (
    `<% if(typeof releases !== "undefined" && Array.isArray(releases) && releases.length > 0) { %>` +
    `<% var releaseInfos = releases.filter(function(release) { return !!release.name && !release.private && release.hasCommit }) %>` +
    `<% if(releaseInfos.length) { %>` +
    `<% var groups = {} %>` +
    `<% releaseInfos.forEach(function(release) { %>` +
    `<% if (groups[release.gitTag] == null) { groups[release.gitTag] = [] } %>` +
    `<% groups[release.gitTag].push(release) %>` +
    `<% }) %>` +
    `🎉 This <%= issue.pull_request ? 'PR is included' : 'issue has been resolved' %> in the following release 🎉\n\n` +
    `<% var renderItem = function (item) { %>` +
    `<% if(item.url) { %>` +
    `<% return "[" + item.name + "](" + item.url + ")" %>` +
    `<% } else { %>` +
    `<% return item.name %>` +
    `<% } %>` +
    ` <% } %>` +
    `<% Object.keys(groups).forEach(function(tag) { %>` +
    `\n- <%= tag %>` +
    `<% var items = groups[tag] %>` +
    `<% if(items.length === 1) { %>` +
    `: <%= renderItem(items[0]) %>` +
    `<% } else { %>` +
    `<% items.forEach(function(item) { %>` +
    `\n  - <%= renderItem(item) %>` +
    `<% }) %>` +
    `<% } %>` +
    `<% }) %>` +
    `\n\n${footerMsg}<% } %>` +
    `<% } %>`
  )
}

export function getFailedComment(footer?: string) {
  return footer
}
