/* eslint-disable no-promise-executor-return */
/* eslint-disable arrow-parens */
export class TaskQueue {
  private queue: (() => Promise<void>)[] = [];

  private running = false;

  private taskInterval: number;

  private pendingComplete = false;

  private activeTasks = new Set<Promise<void>>();

  constructor(taskIntervalMs = 3000) {
    this.taskInterval = taskIntervalMs;
  }

  addTask(task: () => Promise<void>) {
    this.queue.push(task);
    console.log(`[TaskQueue] Task added — queued=${this.queue.length} running=${this.running}`);
    this.runNextTask();
  }

  clearQueue() {
    const prevLen = this.queue.length;
    this.queue = [];
    this.activeTasks.clear();
    this.running = false;
    console.log(`[TaskQueue] Queue cleared (had ${prevLen} pending tasks)`);
  }

  private async runNextTask() {
    if (this.running || this.queue.length === 0) {
      if (this.queue.length === 0 && this.activeTasks.size === 0 && this.pendingComplete) {
        this.pendingComplete = false;
        await new Promise(resolve => setTimeout(resolve, this.taskInterval));
      }
      return;
    }

    this.running = true;
    const task = this.queue.shift();
    if (task) {
      console.log(`[TaskQueue] Starting task — remaining=${this.queue.length}`);
      const taskPromise = task();
      this.activeTasks.add(taskPromise);

      try {
        await taskPromise;
        console.log(`[TaskQueue] Task completed — remaining=${this.queue.length}`);
        await new Promise(resolve => setTimeout(resolve, this.taskInterval));
      } catch (error) {
        console.error('[TaskQueue] Task threw an error:', error);
      } finally {
        this.activeTasks.delete(taskPromise);
        this.running = false;
        this.runNextTask();
      }
    }
  }

  public hasTask(): boolean {
    return this.queue.length > 0 || this.activeTasks.size > 0 || this.running;
  }

  public waitForCompletion(): Promise<void> {
    this.pendingComplete = true;
    return new Promise((resolve) => {
      const check = () => {
        if (!this.hasTask()) {
          resolve();
        } else {
          setTimeout(check, 10);
        }
      };
      check();
    });
  }
}

export const audioTaskQueue = new TaskQueue(20);
