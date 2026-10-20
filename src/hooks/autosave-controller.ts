export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';
export class AutosaveController<T> {
  private latest: T;
  private persisted: string;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private running: Promise<void> | null = null;
  status: SaveStatus = 'idle';
  constructor(
    initial: T,
    private save: (value: T) => Promise<unknown>,
    private notify: (status: SaveStatus) => void,
  ) {
    this.latest = initial;
    this.persisted = JSON.stringify(initial);
  }
  update(value: T) {
    this.latest = value;
    clearTimeout(this.timer);
    if (JSON.stringify(value) !== this.persisted) {
      this.timer = setTimeout(() => {
        void this.flush().catch(() => {});
      }, 1000);
    }
  }
  get value() {
    return this.latest;
  }
  private state(status: SaveStatus) {
    this.status = status;
    this.notify(status);
  }
  async flush(): Promise<void> {
    clearTimeout(this.timer);
    if (this.running) await this.running;
    if (JSON.stringify(this.latest) === this.persisted) return;
    const snapshot = this.latest;
    this.state('saving');
    this.running = this.save(snapshot)
      .then(() => {
        this.persisted = JSON.stringify(snapshot);
        this.state('saved');
      })
      .catch((error: unknown) => {
        this.state('error');
        throw error;
      });
    try {
      await this.running;
    } finally {
      this.running = null;
    }
    if (JSON.stringify(this.latest) !== this.persisted) await this.flush();
  }
}
