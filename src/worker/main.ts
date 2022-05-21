import HCA from "../HCA";
import HCAInfo from "../VGAudio/Codecs/CriHca/HcaInfo";
import type HCATask from "./HCATask";
import HCATaskQueue from "./HCATaskQueue";

// Web Worker / AudioWorklet support
if (typeof document === "undefined") {
  if (typeof onmessage === "undefined") {
    // AudioWorklet
    let aa: AudioParamDescriptor;
  } else {
    // Web Worker
    const taskQueue = new HCATaskQueue(
      "Background-HCAWorker",
      (msg: any, trans: Transferable[]) => (postMessage as any)(msg, trans),
      (task: HCATask) => {
        switch (task.cmd) {
          case "nop":
            return;
          case "fixHeaderChecksum":
            return HCAInfo.fixHeaderChecksum.apply(HCAInfo, task.args);
          case "fixChecksum":
            return HCA.fixChecksum.apply(HCA, task.args);
          case "decrypt":
            return HCA.decrypt.apply(HCA, task.args);
          case "encrypt":
            return HCA.encrypt.apply(HCA, task.args);
          case "addCipherHeader":
            return HCAInfo.addCipherHeader.apply(HCAInfo, task.args);
          case "decode":
            return HCA.decode.apply(HCA, task.args);
          default:
            throw new Error(`unknown cmd ${task.cmd}`);
        }
      },
      () => {
        taskQueue.sendCmd("self-destruct", []);
      },
    );
    onmessage = (ev: MessageEvent) => taskQueue.msgHandler(ev);
  }
}
