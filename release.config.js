const releaseRules = [
  {
    type: 'build',
    release: 'patch',
  },
  {
    type: 'ci',
    release: 'patch',
  },
  {
    type: 'chore',
    release: 'patch',
  },
  {
    type: 'docs',
    release: 'patch',
  },
  {
    type: 'refactor',
    release: 'patch',
  },
  {
    type: 'style',
    release: 'patch',
  },
  {
    type: 'test',
    release: 'patch',
  },
]

function getSuccessComment() {
  return (
    ''
    + ":tada: This <%= issue.pull_request ? 'PR is included' : 'issue has been resolved' %> :tada:"
    + '<% if(typeof releases !== "undefined" && Array.isArray(releases) && releases.length > 0) { %>'
      + '<% var releaseInfos = releases.filter(function(release) { return !!release.name }) %>'
      + '<% if(releaseInfos.length) { %>'
        + '<% var groups = {} %>'
        + '<% releaseInfos.forEach(function(release) { %>'
          + '<% if (groups[release.gitTag] == null) { groups[release.gitTag] = [] } %>'
          + '<% groups[release.gitTag].push(release) %>'
        + '<% }) %>'

        + '\n\nThe release is available on'

        + '<% Object.keys(groups).forEach(function(tag) { %>'
          + `\n- <%= tag%>: `
          + '<% var items = groups[tag] %>'
          + '<% if(items.length === 1) { %>'
            + '<% if(items[0].url) { %>'
              + '[<%= items[0].name %>](<%= items[0].url %>)'
            + '<% } else { %>'
              + '<%= items[0].name %>'
          + '<% } %>'
          + '<% } else { %>'
            + '<% items.forEach(function(item) { %>'
              + '\n  - '
              + '<% if(item.url) { %>'
                + '[<%= item.name %>](<%= item.url %>)'
              + '<% } else { %>'
                + '<%= item.name %>'
              + '<% } %>'
            + '<% }) %>'
          + '<% } %>'
        + '<% }) %>'
      + '<% } %>'
    + '<% } %>'
  )
}

module.exports = {
  repositoryUrl: "https://github.com/bubkoo/monorepo-semantic-release",
  plugins: [
    [
      '@semantic-release/commit-analyzer',
      {
        releaseRules,
      },
    ],
    '@semantic-release/release-notes-generator',
    '@semantic-release/changelog',
    '@semantic-release/npm',
    [
      '@semantic-release/github',
      {
        successComment: getSuccessComment(),
        addReleases: 'bottom',
      },
    ],
    [
      '@semantic-release/git',
      {
        assets: ['package.json', 'CHANGELOG.md'],
      },
    ],
  ],
}
