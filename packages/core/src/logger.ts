import signale from 'signale'

export function getLogger({
  stdout,
  stderr,
}: {
  stdout: NodeJS.WriteStream
  stderr: NodeJS.WriteStream
}) {
  return new signale.Signale({
    config: { displayTimestamp: true, displayLabel: false },
    scope: 'msr',
    stream: stdout,
    types: {
      info: { color: 'magenta', label: '', badge: 'ℹ', stream: [stdout] },
      error: { color: 'red', label: '', badge: '✖', stream: [stderr] },
      log: { color: 'magenta', label: '', badge: '•', stream: [stdout] },
      success: { color: 'green', label: '', badge: '✔', stream: [stdout] },
      complete: { color: 'green', label: '', badge: '☺', stream: [stdout] },
      start: { color: 'cyan', label: '', badge: '⌘', stream: [stdout] },
    },
  })
}
