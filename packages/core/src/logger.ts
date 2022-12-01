import signale from 'signale'
import figures from 'figures'

export function getLogger({
  stdout,
  stderr,
}: {
  stdout: NodeJS.WriteStream
  stderr: NodeJS.WriteStream
}) {
  return new signale.Signale({
    config: { displayTimestamp: true, displayLabel: false },
    scope: 'srm',
    stream: stdout,
    types: {
      info: {
        color: 'magenta',
        label: '',
        badge: figures.info,
        stream: [stdout],
      },
      error: {
        color: 'red',
        label: '',
        badge: figures.cross,
        stream: [stderr],
      },
      log: {
        color: 'magenta',
        label: '',
        badge: figures.bullet,
        stream: [stdout],
      },
      success: {
        color: 'green',
        label: '',
        badge: figures.tick,
        stream: [stdout],
      },
      complete: {
        color: 'red',
        label: '',
        badge: figures.heart,
        stream: [stdout],
      },
      start: {
        color: 'cyan',
        label: '',
        badge: figures.home,
        stream: [stdout],
      },
    },
  })
}
