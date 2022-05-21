import type HCAInfo from "../VGAudio/Codecs/CriHca/HcaInfo";

class HCAWaveSmplChunk {
  readonly size = 60;
  readonly manufacturer = 0;
  readonly product = 0;
  readonly samplePeriod: number;
  readonly MIDIUnityNote = 0x3c;
  readonly MIDIPitchFraction = 0;
  readonly SMPTEFormat = 0;
  readonly SMPTEOffset: number;
  readonly sampleLoops = 1;
  readonly samplerData = 0x18;
  readonly loop_Identifier = 0;
  readonly loop_Type = 0;
  readonly loop_Start: number;
  readonly loop_End: number;
  readonly loop_Fraction = 0;
  readonly loop_PlayCount = 0;
  constructor(info: HCAInfo) {
    if (!info.hasHeader["loop"]) throw new Error('missing "loop" header');
    this.samplePeriod = 1 / info.format.samplingRate * 1000000000;
    this.loop_Start = info.loopStartAtSample - info.startAtSample;
    this.loop_End = info.loopEndAtSample - info.startAtSample;
    this.SMPTEOffset = 1;
  }
  get(): Uint8Array {
    let buf = new ArrayBuffer(8 + this.size);
    let ret = new Uint8Array(buf);
    let p = new DataView(buf);
    let te = new TextEncoder();
    ret.set(te.encode("smpl"), 0);
    p.setUint32(4, this.size, true);
    p.setUint32(8, this.manufacturer, true);
    p.setUint32(12, this.product, true);
    p.setUint32(16, this.samplePeriod, true);
    p.setUint32(20, this.MIDIUnityNote, true);
    p.setUint32(24, this.MIDIPitchFraction, true);
    p.setUint32(28, this.SMPTEFormat, true);
    p.setUint32(32, this.SMPTEOffset, true);
    p.setUint32(36, this.sampleLoops, true);
    p.setUint32(40, this.samplerData, true);
    p.setUint32(44, this.loop_Identifier, true);
    p.setUint32(48, this.loop_Type, true);
    p.setUint32(52, this.loop_Start, true);
    p.setUint32(56, this.loop_End, true);
    p.setUint32(60, this.loop_Fraction, true);
    p.setUint32(64, this.loop_PlayCount, true);
    return ret;
  }
}

export default HCAWaveSmplChunk;
