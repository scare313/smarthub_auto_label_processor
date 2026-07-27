// A simple single-worker async queue. Ensures only ONE action (scheduled cycle,
// or a manual button click from the web UI) touches the browser/session at a
// time — this is what prevents overlapping runs (the concurrency risk of
// running Task Scheduler + manual actions independently).

class ActionQueue {
  constructor() {
    this._busy = false;
    this._current = null; // { name, startedAt }
    this._pending = [];
  }

  get busy() {
    return this._busy;
  }

  get current() {
    return this._current;
  }

  get pendingNames() {
    return this._pending.map((j) => j.name);
  }

  // Enqueue a named async job. Resolves/rejects when that job completes.
  run(name, fn) {
    return new Promise((resolve, reject) => {
      this._pending.push({ name, fn, resolve, reject });
      this._drain();
    });
  }

  async _drain() {
    if (this._busy) return;
    const job = this._pending.shift();
    if (!job) return;
    this._busy = true;
    this._current = { name: job.name, startedAt: new Date().toISOString() };
    try {
      const result = await job.fn();
      job.resolve(result);
    } catch (e) {
      job.reject(e);
    } finally {
      this._busy = false;
      this._current = null;
      this._drain();
    }
  }
}

export const queue = new ActionQueue();
