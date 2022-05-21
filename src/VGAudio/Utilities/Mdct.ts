import * as HCAUtilFunc from "./Helpers";

class Mdct {
  MdctBits: number;
  MdctSize: number;
  Scale: number;

  private static _tableBits = -1;
  private static readonly SinTables: Float64Array[] = [];
  private static readonly CosTables: Float64Array[] = [];
  private static readonly ShuffleTables: Int32Array[] = [];

  private readonly _mdctPrevious: Float64Array;
  private readonly _imdctPrevious: Float64Array;
  private readonly _imdctWindow: Float64Array;

  private readonly _scratchMdct: Float64Array;
  private readonly _scratchDct: Float64Array;

  constructor(mdctBits: number, window: Float64Array, scale = 1) {
    Mdct.SetTables(mdctBits);

    this.MdctBits = mdctBits;
    this.MdctSize = 1 << mdctBits;
    this.Scale = scale;

    if (window.length < this.MdctSize) {
      throw new Error("Window must be as long as the MDCT size.");
    }

    this._mdctPrevious = new Float64Array(this.MdctSize);
    this._imdctPrevious = new Float64Array(this.MdctSize);
    this._scratchMdct = new Float64Array(this.MdctSize);
    this._scratchDct = new Float64Array(this.MdctSize);
    this._imdctWindow = window;
  }

  private static SetTables(maxBits: number): void {
    if (maxBits > this._tableBits) {
      for (let i = this._tableBits + 1; i <= maxBits; i++) {
        let out = this.GenerateTrigTables(i);
        this.SinTables.push(out.sin);
        this.CosTables.push(out.cos);
        this.ShuffleTables.push(this.GenerateShuffleTable(i));
      }
      this._tableBits = maxBits;
    }
  }

  public RunMdct(input: Float64Array, output: Float64Array): void {
    if (input.length < this.MdctSize) {
      throw new Error("Input must be as long as the MDCT size.");
    }

    if (output.length < this.MdctSize) {
      throw new Error("Output must be as long as the MDCT size.");
    }

    let size = this.MdctSize;
    let half = (size >> 1);
    let dctIn = this._scratchMdct;

    for (let i = 0; i < half; i++) {
      let a = this._imdctWindow[half - i - 1] * -input[half + i];
      let b = this._imdctWindow[half + i] * input[half - i - 1];
      let c = this._imdctWindow[i] * this._mdctPrevious[i];
      let d = this._imdctWindow[size - i - 1] *
        this._mdctPrevious[size - i - 1];

      dctIn[i] = a - b;
      dctIn[half + i] = c - d;
    }

    this.Dct4(dctIn, output);
    this._mdctPrevious.set(input, input.length);
  }

  public RunImdct(input: Float64Array, output: Float64Array): void {
    if (input.length < this.MdctSize) {
      throw new Error("Input must be as long as the MDCT size.");
    }

    if (output.length < this.MdctSize) {
      throw new Error("Output must be as long as the MDCT size.");
    }

    let size = this.MdctSize;
    let half = (size >> 1);
    let dctOut = this._scratchMdct;

    this.Dct4(input, dctOut);

    for (let i = 0; i < half; i++) {
      output[i] = this._imdctWindow[i] * dctOut[i + half] +
        this._imdctPrevious[i];
      output[i + half] = this._imdctWindow[i + half] * -dctOut[size - 1 - i] -
        this._imdctPrevious[i + half];
      this._imdctPrevious[i] = this._imdctWindow[size - 1 - i] *
        -dctOut[half - i - 1];
      this._imdctPrevious[i + half] = this._imdctWindow[half - i - 1] *
        dctOut[i];
    }
  }

  /**
   * Does a Type-4 DCT.
   *
   * @param input The input array containing the time or frequency-domain samples
   * @param output The output array that will contain the transformed time or frequency-domain samples
   */
  private Dct4(input: Float64Array, output: Float64Array): void {
    let shuffleTable = Mdct.ShuffleTables[this.MdctBits];
    let sinTable = Mdct.SinTables[this.MdctBits];
    let cosTable = Mdct.CosTables[this.MdctBits];
    let dctTemp = this._scratchDct;

    let size = this.MdctSize;
    let lastIndex = size - 1;
    let halfSize = (size >> 1);

    for (let i = 0; i < halfSize; i++) {
      let i2 = i * 2;
      let a = input[i2];
      let b = input[lastIndex - i2];
      let sin = sinTable[i];
      let cos = cosTable[i];
      dctTemp[i2] = a * cos + b * sin;
      dctTemp[i2 + 1] = a * sin - b * cos;
    }
    let stageCount = this.MdctBits - 1;

    for (let stage = 0; stage < stageCount; stage++) {
      let blockCount = 1 << stage;
      let blockSizeBits = stageCount - stage;
      let blockHalfSizeBits = blockSizeBits - 1;
      let blockSize = 1 << blockSizeBits;
      let blockHalfSize = 1 << blockHalfSizeBits;
      sinTable = Mdct.SinTables[blockHalfSizeBits];
      cosTable = Mdct.CosTables[blockHalfSizeBits];

      for (let block = 0; block < blockCount; block++) {
        for (let i = 0; i < blockHalfSize; i++) {
          let frontPos = (block * blockSize + i) * 2;
          let backPos = frontPos + blockSize;
          let a = dctTemp[frontPos] - dctTemp[backPos];
          let b = dctTemp[frontPos + 1] - dctTemp[backPos + 1];
          let sin = sinTable[i];
          let cos = cosTable[i];
          dctTemp[frontPos] += dctTemp[backPos];
          dctTemp[frontPos + 1] += dctTemp[backPos + 1];
          dctTemp[backPos] = a * cos + b * sin;
          dctTemp[backPos + 1] = a * sin - b * cos;
        }
      }
    }

    for (let i = 0; i < this.MdctSize; i++) {
      output[i] = dctTemp[shuffleTable[i]] * this.Scale;
    }
  }

  private static GenerateTrigTables(
    sizeBits: number,
  ): { sin: Float64Array; cos: Float64Array } {
    let size = 1 << sizeBits;
    let out: { sin: Float64Array; cos: Float64Array } = {
      sin: new Float64Array(size),
      cos: new Float64Array(size),
    };

    for (let i = 0; i < size; i++) {
      let value = Math.PI * (4 * i + 1) / (4 * size);
      out.sin[i] = Math.sin(value);
      out.cos[i] = Math.cos(value);
    }

    return out;
  }

  private static GenerateShuffleTable(sizeBits: number): Int32Array {
    let size = 1 << sizeBits;
    var table = new Int32Array(size);

    for (let i = 0; i < size; i++) {
      table[i] = HCAUtilFunc.SignedBitReverse32Trunc(i ^ (i >> 1), sizeBits);
    }

    return table;
  }

  // ReSharper disable once UnusedMember.Local
  /**
   * Does a Type-4 DCT. Intended for reference.
   *
   * @param input The input array containing the time or frequency-domain samples
   * @param output The output array that will contain the transformed time or frequency-domain samples
   */
  private Dct4Slow(input: Float64Array, output: Float64Array): void {
    for (let k = 0; k < this.MdctSize; k++) {
      let sample = 0;
      for (let n = 0; n < this.MdctSize; n++) {
        let angle = Math.PI / this.MdctSize * (k + 0.5) * (n + 0.5);
        sample += Math.cos(angle) * input[n];
      }
      output[k] = sample * this.Scale;
    }
  }
}

export default Mdct;
