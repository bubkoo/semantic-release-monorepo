import _ from 'lodash'
import EventEmitter from 'promise-events'
import { Package } from './types.js'
import { getDebugger } from './debugger.js'

const debug = getDebugger('sync')

export class Synchronizer {
  public readonly ee = new EventEmitter()

  private readonly store: {
    evt: { [name: string]: Promise<any> }
    subscr: { [name: string]: Promise<any> }
  } = { evt: {}, subscr: {} }

  private readonly luckyMap: { [name: string]: Promise<any> } = {}
  private readonly waitForMap: { [name: string]: Promise<any> } = {}

  constructor(private readonly packages: Package[]) {}

  private getEventName(probe: string, pkg?: Package) {
    return `${probe}${pkg ? `:${pkg.name}` : ''}`
  }

  todo() {
    return this.packages.filter((p) => p.result == null)
  }

  find(condition: (pkg: Package) => boolean) {
    return this.packages.filter((p) => p.result == null).find(condition)
  }

  emit(probe: Synchronizer.Probe, pkg?: Package) {
    const name = this.getEventName(probe, pkg)
    debug('ready: %s', name)

    return this.store.evt[name] || (this.store.evt[name] = this.ee.emit(name))
  }

  once(probe: Synchronizer.Probe, pkg?: Package) {
    const name = this.getEventName(probe, pkg)
    return (
      this.store.evt[name] ||
      this.store.subscr[name] ||
      (this.store.subscr[name] = this.ee.once(name))
    )
  }

  getLucky(probe: Synchronizer.Probe, pkg?: Package) {
    if (this.luckyMap[probe] != null) {
      return
    }
    debug('lucky: %s', this.getEventName(probe, pkg))
    this.luckyMap[probe] = this.emit(probe, pkg)
  }

  waitFor(probe: Synchronizer.Probe, pkg: Package) {
    const name = this.getEventName(probe, pkg)
    return (
      this.waitForMap[name] || (this.waitForMap[name] = this.once(probe, pkg))
    )
  }

  waitForAll(
    prop: Synchronizer.Probe,
    condition: (pkg: Package) => boolean,
    filter: (pkg: Package) => boolean = _.identity,
  ) {
    const probe = prop
    const promise = this.once(probe)
    const awaitedPkgs = this.todo().filter(filter)
    if (awaitedPkgs.every(condition)) {
      awaitedPkgs.length && debug('ready: %s', probe)
      this.emit(probe)
    }

    return promise
  }
}

export namespace Synchronizer {
  export type Probe =
    | 'readyForRelease'
    | 'readyForTagging'
    | 'analyzed'
    | 'nextRelease'
}
