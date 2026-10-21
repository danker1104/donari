// @ts-check

export class LoadGeneration {
  constructor() {
    this.nextId = 0;
    /** @type {{id:number,controller:AbortController}|null} */
    this.active = null;
  }

  begin() {
    this.active?.controller.abort();
    const active = { id: ++this.nextId, controller: new globalThis.AbortController() };
    this.active = active;
    return { id: active.id, signal: active.controller.signal };
  }

  cancel() {
    this.active?.controller.abort();
    this.active = null;
  }

  /** @param {number} id */
  isCurrent(id) {
    return this.active?.id === id && !this.active.controller.signal.aborted;
  }
}
