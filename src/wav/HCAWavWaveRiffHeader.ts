class HCAWavWaveRiffHeader {
  readonly size: number;
  constructor(size: number) {
    if (isNaN(size)) throw new Error("size must be number");
    size = Math.floor(size);
    if (size <= 0) throw new Error();
    this.size = 4 + size; // "WAVE" + remaining part
  }
  get(): Uint8Array {
    let buf = new ArrayBuffer(12);
    let ret = new Uint8Array(buf);
    let p = new DataView(buf);
    let te = new TextEncoder();
    ret.set(te.encode("RIFF"), 0);
    p.setUint32(4, this.size, true);
    ret.set(te.encode("WAVE"), 8);
    return ret;
  }
}

export default HCAWavWaveRiffHeader;
