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
  // note: spaces will break the generated markdown
  return (
    ''
    + ":tada: This <%= issue.pull_request ? 'PR is included' : 'issue has been resolved' %> in version <%= nextRelease.version %> :tada:"
    + '<% if(typeof releases !== "undefined" && Array.isArray(releases) && releases.length > 0) { %>'
    + '<% var releaseInfos = releases.filter(function(release) { return !!release.name }) %>'
    + '<% if(releaseInfos.length) { %>'
    + '\n\nThe release is available on'
    + '<% if (releaseInfos.length === 1) { %>'
    + ' '
    + '<% if(releaseInfos[0].url) { %>'
    + '[<%= releaseInfos[0].name %>](<%= releaseInfos[0].url %>)'
    + '<% } else { %>'
    + '<%= releaseInfos[0].name %>'
    + '<% } %>'
    + '<% } else { %>'
    + ':'
    + '<% releaseInfos.forEach(function(release) { %>'
    + '\n- '
    + '<% if(release.url) { %>'
    + '[<%= release.name %>](<%= release.url %>)'
    + '<% } else { %>'
    + '<%= release.name %>'
    + '<% } %>'
    + '<% }) %>'
    + '<% } %>'
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
