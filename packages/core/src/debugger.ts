import debug from 'debug'

export type DebugModule = 'options' | 'commits' | 'deps' | 'plugins' | 'sync'

const prefix = 'srm'

export function getDebugger(module: DebugModule) {
  return debug(`${prefix}:${module}`)
}

export function enableDebugger(module?: string | boolean) {
  if (module) {
    if (typeof module === 'string') {
      module.split(/,\|/).forEach((ns) => debug.enable(`${prefix}:${ns}`))
    } else {
      debug.enable(`semantic-release:*`)
      debug.enable(`${prefix}:*`)
    }
  }
}
