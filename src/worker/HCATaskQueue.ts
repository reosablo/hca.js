import HCATask from "./HCATask";

class HCATaskQueue {
  private readonly origin: string;

  private _isAlive = true;
  private isIdle = true;

  // comparing to structured copy (by default), if data size is big (because of zero-copy),
  // transferring is generally much faster. however it obviously has a drawback,
  // that transferred arguments are no longer accessible in the sender thread
  private transferArgs = false;
  // the receiver/callee will always use transferring to send back arguments,
  // not sending the arguments back is supposed to save a little time/overhead
  private replyArgs = false;

  private readonly postMessage: (msg: any, transfer: Transferable[]) => void;
  private readonly taskHandler: (task: HCATask) => any | Promise<any>;
  private readonly destroy: () => void | Promise<void>;
  private queue: HCATask[] = [];
  private static readonly maxTaskID = 256; // there's recursion in sendNextTask when making fake reply
  private _lastTaskID = 0;
  private getNextTaskID(): number {
    const max = HCATaskQueue.maxTaskID - 1;
    if (this._lastTaskID < 0 || this._lastTaskID > max) {
      throw new Error("lastTaskID out of range");
    }
    const start = this._lastTaskID + 1;
    for (let i = start; i <= start + max; i++) {
      const taskID = i % (max + 1);
      if (this.callbacks[taskID] == null) return this._lastTaskID = taskID;
    }
    throw new Error("cannot find next taskID");
  }
  private callbacks: Record<number, {
    resolve: (result?: any) => void;
    reject: (reason?: any) => void;
    hook?: HCATaskHook;
  }> = {};
  private static readonly discardReplyTaskID = -1;

  private sendTask(task: HCATask): void {
    if (task.origin !== this.origin) {
      throw new Error(
        "the task to be sent must have the same origin as the task queue",
      );
    }
    this.postMessage(task, this.transferArgs ? task.transferList : []);
  }

  private sendReply(task: HCATask): void {
    if (task.origin === this.origin) {
      throw new Error(
        "the reply to be sent must not have the same origin as the task queue",
      );
    }
    this.postMessage(task, task.transferList); // always use transferring to send back arguments
  }

  private async sendNextTask(): Promise<void> {
    let task = this.queue.shift();
    if (task == null) {
      this.isIdle = true;
    } else {
      this.isIdle = false;
      // apply hook first
      const registered = this.callbacks[task.taskID];
      const taskHook = registered != null && registered.hook != null &&
          registered.hook.task != null
        ? registered.hook.task
        : undefined;
      if (taskHook != null) {
        try {
          task = await taskHook(task);
        } catch (e) {
          task.errMsg = `[${this.origin}] error when applying hook ` +
            `before executing cmd ${task.cmd} from ${task.origin}`;
          if (typeof e === "string" || e instanceof Error) {
            task.errMsg += "\n" + e.toString();
          }
          task.isDummy = true;
        }
      }
      // send task
      if (task.isDummy) {
        if (!task.hasErr && !task.hasResult) task.result = null;
        const ev = new MessageEvent("message", { data: task }); // not actually sending, use a fake reply
        this.msgHandler(ev); // won't await
      } else {
        this.sendTask(task);
      }
    }
  }

  constructor(
    origin: string,
    postMessage: (msg: any, transfer: Transferable[]) => void,
    taskHandler: (task: HCATask) => any | Promise<any>,
    destroy: () => void | Promise<void>,
  ) {
    this.origin = origin;
    this.postMessage = postMessage;
    this.taskHandler = taskHandler;
    this.destroy = destroy;
  }

  get isAlive(): boolean {
    return this._isAlive;
  }

  // these following two methods/functions are supposed to be callbacks
  async msgHandler(ev: MessageEvent): Promise<void> {
    try {
      const task = HCATask.recreate(ev.data);
      if (task.origin !== this.origin) {
        // incoming cmd to execute
        try {
          task.result = await this.taskHandler(task);
        } catch (e) {
          // it's observed that Firefox refuses to postMessage an Error object:
          // "DataCloneError: The object could not be cloned."
          // (observed in Firefox 97, not clear about other versions)
          // Chrome doesn't seem to have this problem,
          // however, in order to keep compatible with Firefox,
          // we still have to avoid posting an Error object
          task.errMsg =
            `[${this.origin}] error when executing cmd ${task.cmd} from ${task.origin}`;
          if (typeof e === "string" || e instanceof Error) {
            task.errMsg += "\n" + e.toString();
          }
        }
        if (task.taskID != HCATaskQueue.discardReplyTaskID) {
          try {
            this.sendReply(task);
          } catch (e) {
            console.error(`[${this.origin}] sendReply failed.`, e);
            task.errMsg = (task.errMsg == null ? "" : task.errMsg + "\n\n") +
              "postMessage from Worker failed";
            if (typeof e === "string" || e instanceof Error) {
              task.errMsg += "\n" + e.toString();
            }
            // try again
            this.sendReply(task); // if it throws, just let it throw
          }
        }
      } else {
        // receiving cmd result
        // find & unregister callback
        const registered = this.callbacks[task.taskID];
        delete this.callbacks[task.taskID];

        // apply hook
        let result = task.hasResult ? task.result : undefined;
        const hook = registered.hook;
        if (hook != null) {
          try {
            if (task.hasErr && hook.error != null) {
              await hook.error(task.errMsg);
            } else if (task.hasResult && hook.result != null) {
              result = await hook.result(task.result);
            }
          } catch (e) {
            if (!task.hasErr) task.errMsg = "";
            task.errMsg += `[${this.origin}] error when applying hook ` +
              `after executing cmd ${task.cmd} from ${task.origin}`;
            if (typeof e === "string" || e instanceof Error) {
              task.errMsg += "\n" + e.toString();
            }
          }
        }

        // settle promise
        if (task.hasErr) {
          registered.reject(task.errMsg);
        } else if (task.hasResult) {
          registered.resolve(result);
        } else {
          throw new Error(
            `task (origin=${task.origin} taskID=${task.taskID} cmd=${task.cmd}) ` +
              `has neither error nor result`,
          ); // should never happen
        }

        // start next task
        await this.sendNextTask();
      }
    } catch (e) {
      // irrecoverable error
      await this.errHandler(e);
    }
  }
  async errHandler(data: any) {
    // irrecoverable error
    if (this._isAlive) {
      // print error message
      console.error(
        `[${this.origin}] destroying background worker on irrecoverable error`,
        data,
      );
      // destroy background worker
      try {
        await this.destroy();
      } catch (e) {
        console.error(`[${this.origin}] error when trying to destroy()`, e);
      }
      // after destroy, mark isAlive as false (otherwise sendCmd will fail)
      this._isAlive = false;
      // reject all pending promises
      for (let taskID in this.callbacks) {
        const reject = this.callbacks[taskID].reject;
        delete this.callbacks[taskID];
        try {
          reject();
        } catch (e) {
          console.error(`[${this.origin}] error rejecting taskID=${taskID}`, e);
        }
      }
    }
  }

  async getTransferConfig(): Promise<
    { transferArgs: boolean; replyArgs: boolean }
  > {
    if (!this._isAlive) throw new Error("dead");
    return await this.execCmd("nop", [], {
      result: () => ({
        transferArgs: this.transferArgs,
        replyArgs: this.replyArgs,
      }),
    });
  }
  async configTransfer(
    transferArgs: boolean,
    replyArgs: boolean,
  ): Promise<void> {
    if (!this._isAlive) throw new Error("dead");
    return await this.execCmd("nop", [], {
      result: () => {
        this.transferArgs = transferArgs ? true : false;
        this.replyArgs = replyArgs ? true : false;
      },
    });
  }

  async execCmd(cmd: string, args: any[], hook?: HCATaskHook): Promise<any> {
    // can be modified to simply wrap execMultiCmd but I just want to let it alone for no special reason
    if (!this._isAlive) throw new Error("dead");
    // assign new taskID
    const taskID = this.getNextTaskID();
    const task = new HCATask(this.origin, taskID, cmd, args, this.replyArgs);
    // register callback
    if (this.callbacks[taskID] != null) {
      throw new Error(`taskID=${taskID} is already occupied`);
    }
    const resultPromise = new Promise((resolve, reject) =>
      this.callbacks[taskID] = { resolve: resolve, reject: reject, hook: hook }
    );
    // append to command queue
    this.queue.push(task);
    // start executing tasks
    if (this.isIdle) await this.sendNextTask();
    // return result
    return await resultPromise;
  }

  async execMultiCmd(
    cmdList: { cmd: string; args: any[]; hook?: HCATaskHook }[],
  ): Promise<any[]> {
    // the point is to ensure "atomicity" between cmds
    if (!this._isAlive) throw new Error("dead");
    let resultPromises: Promise<any>[] = [];
    for (let i = 0; i < cmdList.length; i++) {
      // assign new taskID
      const taskID = this.getNextTaskID();
      const listItem = cmdList[i];
      const task = new HCATask(
        this.origin,
        taskID,
        listItem.cmd,
        listItem.args,
        this.replyArgs,
      );
      // register callback
      if (this.callbacks[taskID] != null) {
        throw new Error(`taskID=${taskID} is already occupied`);
      }
      resultPromises.push(
        new Promise((resolve, reject) =>
          this.callbacks[taskID] = {
            resolve: resolve,
            reject: reject,
            hook: listItem.hook,
          }
        ),
      );
      // append to command queue
      this.queue.push(task);
    }
    // start executing tasks
    if (this.isIdle) await this.sendNextTask();
    // return results
    return await Promise.all(resultPromises);
  }

  sendCmd(cmd: string, args: any[]): void {
    // send cmd without registering callback
    // generally not recommended
    if (!this._isAlive) throw new Error("dead");
    const task = new HCATask(
      this.origin,
      HCATaskQueue.discardReplyTaskID,
      cmd,
      args,
      false,
    );
    this.sendTask(task);
  }

  async shutdown(forcibly = false): Promise<void> {
    if (this._isAlive) {
      if (forcibly) {
        try {
          await this.destroy();
        } catch (e) {
          console.error(
            `[${this.origin}] error when trying to forcibly shutdown.`,
            e,
          );
        }
        this._isAlive = false;
      } else {
        await this.execCmd("nop", [], {
          result: async () => {
            await this.destroy();
            this._isAlive = false;
          },
        });
      }
    }
  }
}

interface HCATaskHook {
  task?: (task: HCATask) => HCATask | Promise<HCATask>; // called before sending cmd & execution
  result?: (result?: any) => any | Promise<any>; // called after execution & receiving reply & reply has result
  error?: (reason?: string) => void | Promise<void>; // same as above except it's for errMsg and it won't change/map reason
}

export default HCATaskQueue;
