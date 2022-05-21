import type HCAInfo from "../VGAudio/Codecs/CriHca/HcaInfo";

class HCAWavFmtChunk {
  readonly size = 16;
  readonly formatTag: number;
  readonly channelCount: number;
  readonly samplesPerSec: number;
  readonly bytesPerSec: number;
  readonly blockAlign: number;
  readonly bitsPerSample: number;
  constructor(info: HCAInfo, mode = 32) {
    switch (mode) {
      case 0: // float
      case 8:
      case 16:
      case 24:
      case 32: // integer
        break;
      default:
        mode = 32;
    }
    let inWavSize = info.calcInWavSize(mode);
    this.formatTag = mode > 0 ? 1 : 3;
    this.channelCount = info.format.channelCount;
    this.samplesPerSec = info.format.samplingRate;
    this.bytesPerSec = inWavSize.sample * info.format.samplingRate;
    this.blockAlign = inWavSize.sample;
    this.bitsPerSample = inWavSize.bitsPerSample;
  }
  get(): Uint8Array {
    let buf = new ArrayBuffer(8 + this.size);
    let ret = new Uint8Array(buf);
    let p = new DataView(buf);
    let te = new TextEncoder();
    ret.set(te.encode("fmt "), 0);
    p.setUint32(4, this.size, true);
    p.setUint16(8, this.formatTag, true);
    p.setUint16(10, this.channelCount, true);
    p.setUint32(12, this.samplesPerSec, true);
    p.setUint32(16, this.bytesPerSec, true);
    p.setUint16(20, this.blockAlign, true);
    p.setUint16(22, this.bitsPerSample, true);
    return ret;
  }
}

export default HCAWavFmtChunk;
