import HCATaskQueue from "./HCATaskQueue";
import "./main";

// create & control worker
class HCAWorker {
  get isAlive(): boolean {
    return this.taskQueue.isAlive;
  }
  private readonly selfUrl: URL;
  private readonly taskQueue: HCATaskQueue;
  private hcaWorker: Worker;
  private lastTick = 0;
  async shutdown(forcibly = false): Promise<void> {
    if (this.taskQueue.isAlive) await this.taskQueue.shutdown(forcibly);
  }
  async tick(): Promise<void> {
    await this.taskQueue.execCmd("nop", []);
    this.lastTick = new Date().getTime();
  }
  async tock(text = ""): Promise<number> {
    await this.taskQueue.execCmd("nop", []);
    const duration = new Date().getTime() - this.lastTick;
    console.log(`${text} took ${duration} ms`);
    return duration;
  }
  static async create(selfUrl: URL | string): Promise<HCAWorker> {
    if (typeof selfUrl === "string") {
      selfUrl = new URL(selfUrl, document.baseURI);
    } else if (!(selfUrl instanceof URL)) {
      throw new Error("selfUrl must be either string or URL");
    }
    // fetch & save hca.js as blob in advance, to avoid creating worker being blocked later, like:
    // (I observed this problem in Firefox)
    // creating HCAAudioWorkletHCAPlayer requires information from HCA, which is sample rate and channel count;
    // however, fetching HCA (originally supposed to be progressive/streamed) blocks later request to fetch hca.js,
    // so that HCAAudioWorkletHCAPlayer can only be created after finishing downloading the whole HCA,
    // which obviously defeats the purpose of streaming HCA
    const response = await fetch(selfUrl.href);
    // Firefox currently does not support ECMAScript modules in Worker,
    // therefore we must strip all export declarations
    const origText = await response.text();
    const convertedText = ("\n" + origText).replace(
      /\bexport\s+{.*?};?/,
      "",
    ).slice(1);
    const blob = new Blob([convertedText], { type: "text/javascript" });
    const reader = new FileReader();
    reader.readAsDataURL(blob);
    const dataURI = await new Promise((res: (result: string) => void) => {
      reader.onloadend = function () {
        res(reader.result as string);
      };
    });
    selfUrl = new URL(dataURI, document.baseURI);
    return new HCAWorker(selfUrl);
  }
  private constructor(selfUrl: URL) {
    this.hcaWorker = new Worker(selfUrl, { type: "module" }); // setting type to "module" is currently bogus in Firefox
    this.selfUrl = selfUrl;
    this.taskQueue = new HCATaskQueue(
      "Main-HCAWorker",
      (msg: any, trans: Transferable[]) =>
        this.hcaWorker.postMessage(msg, trans),
      async (task) => {
        switch (task.cmd) {
          case "self-destruct": // doesn't seem to have a chance to be called
            console.error(`hcaWorker requested to self-destruct`);
            await this.taskQueue.shutdown(true);
            break;
        }
      },
      () => this.hcaWorker.terminate(),
    );
    this.hcaWorker.onmessage = (msg) => this.taskQueue.msgHandler(msg);
    this.hcaWorker.onerror = (msg) => this.taskQueue.errHandler(msg);
    this.hcaWorker.onmessageerror = (msg) => this.taskQueue.errHandler(msg);
  }
  // commands
  async getTransferConfig(): Promise<
    { transferArgs: boolean; replyArgs: boolean }
  > {
    return await this.taskQueue.getTransferConfig();
  }
  async configTransfer(
    transferArgs: boolean,
    replyArgs: boolean,
  ): Promise<void> {
    return await this.taskQueue.configTransfer(transferArgs, replyArgs);
  }
  async fixHeaderChecksum(hca: Uint8Array): Promise<Uint8Array> {
    return await this.taskQueue.execCmd("fixHeaderChecksum", [hca]);
  }
  async fixChecksum(hca: Uint8Array): Promise<Uint8Array> {
    return await this.taskQueue.execCmd("fixChecksum", [hca]);
  }
  async decrypt(hca: Uint8Array, key1?: any, key2?: any): Promise<Uint8Array> {
    return await this.taskQueue.execCmd("decrypt", [hca, key1, key2]);
  }
  async encrypt(hca: Uint8Array, key1?: any, key2?: any): Promise<Uint8Array> {
    return await this.taskQueue.execCmd("encrypt", [hca, key1, key2]);
  }
  async addHeader(
    hca: Uint8Array,
    sig: string,
    newData: Uint8Array,
  ): Promise<Uint8Array> {
    return await this.taskQueue.execCmd("addHeader", [hca, sig, newData]);
  }
  async addCipherHeader(
    hca: Uint8Array,
    cipherType?: number,
  ): Promise<Uint8Array> {
    return await this.taskQueue.execCmd("addCipherHeader", [hca, cipherType]);
  }
  async decode(
    hca: Uint8Array,
    mode = 32,
    loop = 0,
    volume = 1.0,
  ): Promise<Uint8Array> {
    return await this.taskQueue.execCmd("decode", [hca, mode, loop, volume]);
  }
}

export default HCAWorker;
