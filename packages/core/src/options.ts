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

const SRM_HOME_URL = 'https://github.com/bubkoo/semantic-release-monorepo'
const DEFAULT_FOOTER = `Your **[semantic-release-monorepo](${SRM_HOME_URL})** bot base on **[semantic-release](https://github.com/semantic-release/semantic-release)** :package::rocket:`

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

export function getFailComment(footer?: string) {
  const HOME_URL = 'https://github.com/semantic-release/semantic-release'
  const FAQ_URL = `${HOME_URL}/blob/caribou/docs/support/FAQ.md`
  const GET_HELP_URL = `${HOME_URL}#get-help`
  const USAGE_DOC_URL = `${HOME_URL}/blob/caribou/docs/usage/README.md`
  const NEW_ISSUE_URL = `${HOME_URL}/issues/new`
  const footerMsg = footer || DEFAULT_FOOTER
  return `## :rotating_light: The automated release from the <%= branch.name %> branch failed. :rotating_light:

I recommend you give this issue a high priority, so other packages depending on you can benefit from your bug fixes and new features again.

You can find below the list of errors reported by **semantic-release**. Each one of them has to be resolved in order to automatically publish your package. I'm sure you can fix this 💪.

Errors are usually caused by a misconfiguration or an authentication problem. With each error reported below you will find explanation and guidance to help you to resolve it.

Once all the errors are resolved, **semantic-release** will release your package the next time you push a commit to the <%= branch.name %> branch. You can also manually restart the failed CI job that runs **semantic-release**.

If you are not sure how to resolve this, here are some links that can help you:
- [Usage documentation](${USAGE_DOC_URL})
- [Frequently Asked Questions](${FAQ_URL})
- [Support channels](${GET_HELP_URL})

If those don't help, or if this issue is reporting something you think isn't right, you can always ask the humans behind **[semantic-release](${NEW_ISSUE_URL})**.

<% var formatError = function (error) { %>
  <% var header = '### ' + error.message + '\n\n' %>
  <% if(error.details) { %>
    <% return header + error.details %>
  <% } else { %>
    <% var msg = "Unfortunately this error doesn't have any additional information." %>
    <% if(error.pluginName) { %>
      <% return header + msg + ' Feel free to kindly ask the author of the "' + error.pluginName + '" plugin to add more helpful information.' %>
    <% } else {%>
      <% return header + msg %>
    <% } %>
  <% } %>
<% } %>

<% errors.forEach(function(error){ %>
---

<%= formatError(error) %>
<% }) %>

---

Good luck with your project ✨

${footerMsg}`
}
