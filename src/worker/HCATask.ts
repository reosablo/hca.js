import HCATransTypedArray from "./HCATransTypedArray";

class HCATask {
  isDummy?: boolean;
  readonly origin: string;
  readonly taskID: number;
  readonly cmd: string;
  get args(): any {
    return this._args?.map((arg) => HCATransTypedArray.restore(arg));
  }
  get hasResult(): boolean {
    return this._hasResult;
  }
  get result(): any {
    if (!this._hasResult) throw new Error("no result");
    return HCATransTypedArray.restore(this._result);
  }
  set result(result: any) {
    if (this.hasErr) throw new Error("already has error, cannot set result");
    if (this._hasResult) throw new Error("cannot set result again");
    this._result = HCATransTypedArray.convert(result, this.transferList);
    this._hasResult = true;
    if (!this._replyArgs) delete this._args;
  }
  get hasErr(): boolean {
    return this._errMsg != null;
  }
  get errMsg(): string | undefined {
    return this._errMsg;
  }
  set errMsg(msg: string | undefined) {
    // changing errMsg is allowed, but clearing errMsg is disallowed
    if (typeof msg !== "string") {
      throw new Error("error message must be a string");
    }
    delete this._args;
    if (this._hasResult) {
      // clear result on error
      delete this._result;
      this._hasResult = false;
      this.transferList = [];
      this.args.forEach((arg: any) =>
        HCATransTypedArray.convert(arg, this.transferList)
      );
    }
    this._errMsg = msg;
  }
  transferList: ArrayBuffer[] = [];

  private _args?: any[];
  private _hasResult: boolean = false;
  private _result?: any;
  private _errMsg?: string;
  private readonly _replyArgs: boolean;
  constructor(
    origin: string,
    taskID: number,
    cmd: string,
    args: any[] | undefined,
    replyArgs: boolean,
    isDummy?: boolean,
  ) {
    this.origin = origin;
    this.taskID = taskID;
    this.cmd = cmd;
    this._args = args?.map((arg) =>
      HCATransTypedArray.convert(arg, this.transferList)
    );
    this._replyArgs = replyArgs;
    if (isDummy != null && isDummy) this.isDummy = true;
  }
  static recreate(task: HCATask): HCATask {
    const recreated = new HCATask(
      task.origin,
      task.taskID,
      task.cmd,
      task._args,
      task._replyArgs,
    );
    if (task._errMsg != null) recreated.errMsg = task._errMsg;
    else if (task._hasResult) recreated.result = task._result;
    return recreated;
  }
}

export default HCATask;
