import HCACrc16 from "../../Utilities/Crc16";
import * as HCAUtilFunc from "../../Utilities/Helpers";
import { SamplesPerFrame } from "./CriHcaConstants";

class HCAInfo {
  private rawHeader: Uint8Array;

  version = "";
  dataOffset = 0;
  format = {
    channelCount: 0,
    samplingRate: 0,
    blockCount: 0,
    droppedHeader: 0,
    droppedFooter: 0,
  };
  blockSize = 0;
  hasHeader: Record<string, boolean> = {};
  headerOffset: Record<string, [number, number]> = {}; // [start (inclusive), end (exclusive)]
  kbps = 0;
  compDec = {
    MinResolution: 0,
    MaxResolution: 0,
    TrackCount: 0,
    ChannelConfig: 0,
    TotalBandCount: 0,
    BaseBandCount: 0,
    StereoBandCount: 0,
    HfrBandCount: 0,
    BandsPerHfrGroup: 0,
    Reserved1: 0,
    Reserved2: 0,
  };
  dec = {
    DecStereoType: 0,
  };
  loop = {
    start: 0,
    end: 0,
    // count: 0, // Nyagamon's interpretation
    // r01: 0,
    droppedHeader: 0, // VGAudio's interpretation
    droppedFooter: 0,
  };
  vbr = {
    MaxBlockSize: 0,
    NoiseLevel: 0,
  };
  UseAthCurve: boolean = false;
  cipher = 0;
  rva = 0.0;
  comment = "";

  // computed sample count/offsets
  HfrGroupCount = 0;
  fullSampleCount = 0;
  startAtSample = 0;
  fullEndAtSample = 0;
  loopStartAtSample = 0;
  loopEndAtSample = 0;
  loopSampleCount = 0;
  endAtSample = 0;
  sampleCount = 0;
  // full file size / data part (excluding header, just blocks/frames) size
  fullSize = 0;
  dataSize = 0;
  // depends on decoding mode (bit count)
  inWavSize?: HCAInfoInWavSize;
  private static getSign(
    raw: DataView,
    offset = 0,
    changeMask: boolean,
    encrypt: boolean,
  ) {
    let magic = raw.getUint32(offset, true);
    let strLen = 4;
    for (let i = 0; i < 4; i++) {
      if (raw.getUint8(offset + i) == 0) {
        strLen = i;
        break;
      }
    }
    if (strLen > 0) {
      let mask = 0x80808080 >>> 8 * (4 - strLen);
      magic &= 0x7f7f7f7f;
      if (changeMask) {
        raw.setUint32(offset, encrypt ? magic | mask : magic, true);
      }
    }
    let hex = [
      magic & 0xff,
      magic >> 8 & 0xff,
      magic >> 16 & 0xff,
      magic >> 24 & 0xff,
    ];
    hex = hex.slice(0, strLen);
    return String.fromCharCode.apply(String, hex);
  }
  clone(): HCAInfo {
    return new HCAInfo(this.rawHeader);
  }
  private parseHeader(
    hca: Uint8Array,
    changeMask: boolean,
    encrypt: boolean,
    modList: Record<string, Uint8Array>,
  ) {
    let p = new DataView(hca.buffer, hca.byteOffset, 8);
    let head = HCAInfo.getSign(p, 0, false, encrypt); // do not overwrite for now, until checksum verified
    if (head !== "HCA") {
      throw new Error("Not a HCA file");
    }
    const version = {
      main: p.getUint8(4),
      sub: p.getUint8(5),
    };
    this.version = version.main + "." + version.sub;
    this.dataOffset = p.getUint16(6);
    // verify checksum
    HCACrc16.verify(hca, this.dataOffset - 2);
    let hasModDone = false;
    // checksum verified, now we can overwrite it
    if (changeMask) HCAInfo.getSign(p, 0, changeMask, encrypt);
    // parse the header
    p = new DataView(hca.buffer, hca.byteOffset, this.dataOffset);
    let ftell = 8;
    while (ftell < this.dataOffset - 2) {
      let lastFtell = ftell;
      // get the sig
      let sign = HCAInfo.getSign(p, ftell, changeMask, encrypt);
      // record hasHeader
      this.hasHeader[sign] = true;
      // padding should be the last one
      if (sign == "pad") {
        this.headerOffset[sign] = [ftell, this.dataOffset - 2];
        break;
      }
      // parse data accordingly
      switch (sign) {
        case "fmt":
          this.format.channelCount = p.getUint8(ftell + 4);
          this.format.samplingRate = p.getUint32(ftell + 4) & 0x00ffffff;
          this.format.blockCount = p.getUint32(ftell + 8);
          this.format.droppedHeader = p.getUint16(ftell + 12);
          this.format.droppedFooter = p.getUint16(ftell + 14);
          ftell += 16;
          break;
        case "comp":
          this.blockSize = p.getUint16(ftell + 4);
          this.kbps = this.format.samplingRate * this.blockSize / 128000.0;
          this.compDec.MinResolution = p.getUint8(ftell + 6);
          this.compDec.MaxResolution = p.getUint8(ftell + 7);
          this.compDec.TrackCount = p.getUint8(ftell + 8);
          this.compDec.ChannelConfig = p.getUint8(ftell + 9);
          this.compDec.TotalBandCount = p.getUint8(ftell + 10);
          this.compDec.BaseBandCount = p.getUint8(ftell + 11);
          this.compDec.StereoBandCount = p.getUint8(ftell + 12);
          this.compDec.BandsPerHfrGroup = p.getUint8(ftell + 13);
          this.compDec.Reserved1 = p.getUint8(ftell + 14);
          this.compDec.Reserved2 = p.getUint8(ftell + 15);
          ftell += 16;
          break;
        case "dec":
          this.blockSize = p.getUint16(ftell + 4);
          this.kbps = this.format.samplingRate * this.blockSize / 128000.0;
          this.compDec.MinResolution = p.getUint8(ftell + 6);
          this.compDec.MaxResolution = p.getUint8(ftell + 7);
          this.compDec.TotalBandCount = p.getUint8(ftell + 8);
          +1;
          this.compDec.BaseBandCount = p.getUint8(ftell + 9);
          +1;
          let a = p.getUint8(ftell + 10);
          this.compDec.TrackCount = HCAUtilFunc.GetHighNibble(a);
          this.compDec.ChannelConfig = HCAUtilFunc.GetLowNibble(a);
          this.dec.DecStereoType = p.getUint8(ftell + 11);
          if (this.dec.DecStereoType == 0) {
            this.compDec.BaseBandCount = this.compDec.TotalBandCount;
          } else {
            this.compDec.StereoBandCount = this.compDec.TotalBandCount -
              this.compDec.BaseBandCount;
          }
          ftell += 12;
          break;
        case "vbr":
          ftell += 8;
          break;
        case "ath":
          this.UseAthCurve = p.getUint16(ftell + 4) == 1;
          ftell += 6;
          break;
        case "loop":
          this.loop.start = p.getUint32(ftell + 4);
          this.loop.end = p.getUint32(ftell + 8);
          this.loop.droppedHeader = p.getUint16(ftell + 12);
          this.loop.droppedFooter = p.getUint16(ftell + 14);
          ftell += 16;
          break;
        case "ciph":
          this.cipher = p.getUint16(ftell + 4);
          ftell += 6;
          break;
        case "rva":
          this.rva = p.getFloat32(ftell + 4);
          ftell += 8;
          break;
        case "vbr":
          this.vbr.MaxBlockSize = p.getUint16(ftell + 4);
          this.vbr.NoiseLevel = p.getInt16(ftell + 6);
          break;
        case "comm":
          let len = p.getUint8(ftell + 4);
          let jisdecoder = new TextDecoder("shift-jis");
          this.comment = jisdecoder.decode(
            hca.slice(ftell + 5, ftell + 5 + len),
          );
          break;
        default:
          throw new Error("unknown header sig");
      }
      // record headerOffset
      this.headerOffset[sign] = [lastFtell, ftell];
      // do modification if needed
      let sectionDataLen = ftell - lastFtell - 4;
      let newData = modList[sign];
      if (newData != null) {
        if (newData.byteLength > sectionDataLen) throw new Error();
        hca.set(newData, lastFtell + 4);
        hasModDone = true;
      }
    }
    /*
      // (ported from) Nyagamon's original code, should be (almost) equivalent to CalculateHfrValues
      this.compParam[2] = this.compParam[2] || 1;
      let _a = this.compParam[4] - this.compParam[5] - this.compParam[6];
      let _b = this.compParam[7];
      this.compDec.Reserved1 = _b > 0 ? _a / _b + (_a % _b ? 1 : 0) : 0;
      // Translating the above code with meaningful variable names:
      this.compDec.TrackCount = this.compDec.TrackCount || 1;
      this.compDec.HfrBandCount = this.compDec.TotalBandCount - this.compDec.BaseBandCount - this.compDec.StereoBandCount;
      this.HfrGroupCount = this.compDec.BandsPerHfrGroup;
      this.compDec.Reserved1 = this.HfrGroupCount > 0 ? this.compDec.HfrBandCount / this.HfrGroupCount + (this.compDec.HfrBandCount % this.HfrGroupCount ? 1 : 0) : 0;
      */
    // CalculateHfrValues, ported from VGAudio
    if (this.compDec.BandsPerHfrGroup > 0) {
      this.compDec.HfrBandCount = this.compDec.TotalBandCount -
        this.compDec.BaseBandCount - this.compDec.StereoBandCount;
      this.HfrGroupCount = HCAUtilFunc.DivideByRoundUp(
        this.compDec.HfrBandCount,
        this.compDec.BandsPerHfrGroup,
      );
    }
    // calculate sample count/offsets
    this.fullSampleCount = this.format.blockCount * SamplesPerFrame;
    this.startAtSample = this.format.droppedHeader;
    this.fullEndAtSample = this.fullSampleCount - this.format.droppedFooter;
    if (this.hasHeader["loop"]) {
      this.loopStartAtSample = this.loop.start * SamplesPerFrame +
        this.loop.droppedHeader;
      this.loopEndAtSample = (this.loop.end + 1) * SamplesPerFrame -
        this.loop.droppedFooter;
      this.loopSampleCount = this.loopEndAtSample - this.loopStartAtSample;
    }
    this.endAtSample = this.hasHeader["loop"]
      ? this.loopEndAtSample
      : this.fullEndAtSample;
    this.sampleCount = this.endAtSample - this.startAtSample;
    // calculate file/data size
    this.dataSize = this.blockSize * this.format.blockCount;
    this.fullSize = this.dataOffset + this.dataSize;
    if (changeMask || hasModDone) {
      // fix checksum if requested
      HCACrc16.fix(hca, this.dataOffset - 2);
    }
    let rawHeader = hca.slice(0, this.dataOffset);
    // check validity of parsed values
    this.checkValidity();
    return rawHeader;
  }
  private checkValidity(): void {
    const results: Array<boolean> = [
      this.blockSize > 0,
      0 < this.format.blockCount,
      0 <= this.startAtSample,
      this.startAtSample < this.fullEndAtSample,
      this.fullEndAtSample <= this.fullSampleCount,
    ];
    results.find((result, index) => {
      if (!result) {
        throw new Error(`did not pass normal check on rule ${index}`);
      }
    });
    if (this.hasHeader["loop"]) {
      const loopChecks: Array<boolean> = [
        this.startAtSample <= this.loopStartAtSample,
        this.loopStartAtSample < this.loopEndAtSample,
        this.loopEndAtSample <= this.fullEndAtSample,
      ];
      loopChecks.find((result, index) => {
        if (!result) {
          throw new Error(`did not pass loop check on rule ${index}`);
        }
      });
    }
  }
  getRawHeader(): Uint8Array {
    return this.rawHeader.slice(0);
  }
  private isHeaderChanged(hca: Uint8Array): boolean {
    if (hca.length >= this.rawHeader.length) {
      for (let i = 0; i < this.rawHeader.length; i++) {
        if (hca[i] != this.rawHeader[i]) {
          return true;
        }
      }
    } else return true;
    return false;
  }
  modify(hca: Uint8Array, sig: string, newData: Uint8Array): void {
    // reparse header if needed
    if (this.isHeaderChanged(hca)) {
      this.parseHeader(hca, false, false, {});
    }
    // prepare to modify data in-place
    let modList: Record<string, Uint8Array> = {};
    modList[sig] = newData;
    let encrypt = this.cipher != 0;
    if (sig === "ciph") {
      encrypt =
        new DataView(newData.buffer, newData.byteOffset, newData.byteLength)
          .getUint16(0) != 0;
    }
    // do actual modification & check validity
    this.rawHeader = this.parseHeader(hca, true, encrypt, modList);
  }
  static addHeader(
    hca: Uint8Array,
    sig: string,
    newData: Uint8Array,
  ): Uint8Array {
    // sig must consist of 1-4 ASCII characters
    if (sig.length < 1 || sig.length > 4) throw new Error();
    let newSig = new Uint8Array(4);
    for (let i = 0; i < 4; i++) {
      let c = sig.charCodeAt(i);
      if (c >= 0x80) throw new Error();
      newSig[i] = c;
    }
    // parse header & check validty
    let info = new HCAInfo(hca);
    // check whether specified header section already exists
    if (info.hasHeader[sig]) {
      throw new Error(`header section ${sig} already exists`);
    }
    // prepare a newly allocated buffer
    let newHca = new Uint8Array(
      hca.byteLength + newSig.byteLength + newData.byteLength,
    );
    let insertOffset = info.headerOffset["pad"][0];
    // copy existing headers (except padding)
    newHca.set(hca.subarray(0, insertOffset), 0);
    // copy inserted header
    newHca.set(newSig, insertOffset);
    newHca.set(newData, insertOffset + newSig.byteLength);
    // copy remaining data (padding and blocks)
    newHca.set(
      hca.subarray(insertOffset, hca.byteLength),
      insertOffset + newSig.byteLength + newData.byteLength,
    );
    // update dataOffset
    info.dataOffset += newSig.byteLength + newData.byteLength;
    let p = new DataView(newHca.buffer, newHca.byteOffset, newHca.byteLength);
    p.setInt16(6, info.dataOffset);
    // fix checksum
    HCACrc16.fix(newHca, info.dataOffset - 2);
    // reparse header & recheck validty
    info = new HCAInfo(newHca);
    return newHca;
  }
  static addCipherHeader(hca: Uint8Array, cipherType?: number): Uint8Array {
    let newData = new Uint8Array(2);
    if (cipherType != null) {
      new DataView(newData.buffer).setUint16(0, cipherType);
    }
    return this.addHeader(hca, "ciph", newData);
  }
  static fixHeaderChecksum(hca: Uint8Array): Uint8Array {
    let p = new DataView(hca.buffer, hca.byteOffset, 8);
    let head = this.getSign(p, 0, false, false);
    if (head !== "HCA") {
      throw new Error("Not a HCA file");
    }
    let dataOffset = p.getUint16(6);
    HCACrc16.fix(hca, dataOffset - 2);
    return hca;
  }
  calcInWavSize(mode = 32): HCAInfoInWavSize {
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
    let bitsPerSample = mode == 0 ? 32 : mode;
    let sampleSizeInWav = this.format.channelCount * bitsPerSample / 8;
    return this.inWavSize = {
      bitsPerSample: bitsPerSample,
      sample: sampleSizeInWav,
      block: SamplesPerFrame * sampleSizeInWav,
      dropped: {
        header: this.format.droppedHeader * sampleSizeInWav,
        footer: this.format.droppedFooter * sampleSizeInWav,
      },
      loop: this.hasHeader["loop"]
        ? {
          loopPart: (this.loopEndAtSample - this.loopStartAtSample) *
            sampleSizeInWav,
          dropped: {
            header: this.loop.droppedHeader * sampleSizeInWav,
            footer: this.loop.droppedFooter * sampleSizeInWav,
          },
        }
        : undefined,
    };
  }
  constructor(
    hca: Uint8Array,
    changeMask: boolean = false,
    encrypt: boolean = false,
  ) {
    // if changeMask == true, (un)mask the header sigs in-place
    this.rawHeader = this.parseHeader(hca, changeMask, encrypt, {});
  }
}

interface HCAInfoInWavSize {
  bitsPerSample: number;
  sample: number;
  block: number;
  dropped: {
    header: number;
    footer: number;
  };
  loop?: {
    loopPart: number;
    dropped: {
      header: number;
      footer: number;
    };
  };
}

export default HCAInfo;
