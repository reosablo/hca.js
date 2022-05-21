import type HCAInfo from "../VGAudio/Codecs/CriHca/HcaInfo";

class HCAWavCommentChunk {
  readonly size: number;
  readonly commentBuf: Uint8Array;
  constructor(info: HCAInfo) {
    this.commentBuf = new TextEncoder().encode(info.comment);
    let size = this.commentBuf.byteLength;
    size += 4;
    if (size % 4) size += 4 - size % 4;
    this.size = size;
  }
  get(): Uint8Array {
    let buf = new ArrayBuffer(8 + this.size);
    let ret = new Uint8Array(buf);
    let p = new DataView(buf);
    let te = new TextEncoder();
    ret.set(te.encode("note"), 0);
    p.setUint32(4, this.size, true);
    ret.set(this.commentBuf, 8);
    return ret;
  }
}

export default HCAWavCommentChunk;
