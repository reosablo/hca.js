import type HCAInfo from "../VGAudio/Codecs/CriHca/HcaInfo";
import HCAWavCommentChunk from "./HCAWavCommentChunk";
import HCAWaveSmplChunk from "./HCAWaveSmplChunk";
import HCAWavFmtChunk from "./HCAWavFmtChunk";
import HCAWavWaveRiffHeader from "./HCAWavWaveRiffHeader";

class HCAWav {
  readonly fileBuf: Uint8Array;
  readonly dataPart: Uint8Array;
  readonly waveRiff: HCAWavWaveRiffHeader;
  readonly fmt: HCAWavFmtChunk;
  readonly note?: HCAWavCommentChunk;
  readonly smpl?: HCAWaveSmplChunk;
  constructor(info: HCAInfo, mode = 32, loop = 0) {
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
    if (isNaN(loop)) throw new Error("loop is not number");
    loop = Math.floor(loop);
    if (loop < 0) throw new Error();

    let inWavSize = info.calcInWavSize(mode);
    let dataSize = inWavSize.sample * info.sampleCount;
    if (loop > 0) {
      if (inWavSize.loop == null) throw new Error();
      dataSize += inWavSize.loop.loopPart * loop;
    }

    // prepare metadata chunks and data chunk header
    this.fmt = new HCAWavFmtChunk(info, mode);
    if (info.hasHeader["comm"]) this.note = new HCAWavCommentChunk(info);
    if (info.hasHeader["loop"]) this.smpl = new HCAWaveSmplChunk(info);
    this.waveRiff = new HCAWavWaveRiffHeader(
      8 + this.fmt.size +
        (this.note == null ? 0 : 8 + this.note.size) +
        8 + dataSize +
        (this.smpl == null ? 0 : 8 + this.smpl.size),
    );

    // get bytes of prepared chunks
    let waveRiffHeader = this.waveRiff.get();
    let fmtChunk = this.fmt.get();
    let noteChunk = this.note != null ? this.note.get() : new Uint8Array(0);
    let dataChunkHeader = new Uint8Array(8);
    dataChunkHeader.set(new TextEncoder().encode("data"));
    new DataView(dataChunkHeader.buffer).setUint32(4, dataSize, true);
    let smplChunk = this.smpl != null ? this.smpl.get() : new Uint8Array(0);

    // create whole-file buffer
    this.fileBuf = new Uint8Array(8 + this.waveRiff.size);
    // copy prepared metadata chunks and data chunk header to whole-file buffer
    let writtenLength = 0;
    [waveRiffHeader, fmtChunk, noteChunk, dataChunkHeader].forEach((chunk) => {
      this.fileBuf.set(chunk, writtenLength);
      writtenLength += chunk.byteLength;
    });
    // skip dataPart since it's empty
    this.dataPart = this.fileBuf.subarray(
      writtenLength,
      writtenLength + dataSize,
    );
    writtenLength += dataSize;
    // copy the last prepared chunk to whole-file buffer
    this.fileBuf.set(smplChunk, writtenLength);
    writtenLength += smplChunk.byteLength;

    if (writtenLength != this.fileBuf.byteLength) throw new Error();
  }
}

export default HCAWav;
