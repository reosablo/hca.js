import * as HCAUtilFunc from "./Helpers";

class BitReader {
  Buffer: Uint8Array;
  dv: DataView;
  LengthBits: number;
  Position: number;
  get Remaining(): number {
    return this.LengthBits - this.Position;
  }

  constructor(buffer: Uint8Array) {
    this.Buffer = buffer;
    this.dv = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    this.LengthBits = buffer.length * 8;
    this.Position = 0;
  }

  ReadInt(bitCount: number): number {
    let value: number = this.PeekInt(bitCount);
    this.Position += bitCount;
    return value;
  }

  ReadBool(): boolean {
    return this.ReadInt(1) == 1;
  }

  ReadOffsetBinary(bitCount: number, bias: BitReader.OffsetBias): number {
    let offset: number = (1 << (bitCount - 1)) - bias;
    let value: number = this.PeekInt(bitCount) - offset;
    this.Position += bitCount;
    return value;
  }

  AlignPosition(multiple: number): void {
    this.Position = HCAUtilFunc.GetNextMultiple(this.Position, multiple);
  }

  PeekInt(bitCount: number): number {
    HCAUtilFunc.DebugAssert(bitCount >= 0 && bitCount <= 32);

    if (bitCount > this.Remaining) {
      if (this.Position >= this.LengthBits) return 0;

      let extraBits: number = bitCount - this.Remaining;
      return this.PeekIntFallback(this.Remaining) << extraBits;
    }

    let byteIndex: number = this.Position / 8;
    let bitIndex: number = this.Position % 8;

    if (bitCount <= 9 && this.Remaining >= 16) {
      let value: number = this.dv.getUint16(byteIndex);
      value &= 0xFFFF >> bitIndex;
      value >>= 16 - bitCount - bitIndex;
      return value;
    }

    if (bitCount <= 17 && this.Remaining >= 24) {
      let value: number = this.dv.getUint16(byteIndex) << 8 |
        this.dv.getUint8(byteIndex + 2);
      value &= 0xFFFFFF >> bitIndex;
      value >>= 24 - bitCount - bitIndex;
      return value;
    }

    if (bitCount <= 25 && this.Remaining >= 32) {
      let value: number = this.dv.getUint32(byteIndex);
      value &= 0xFFFFFFFF >>> bitIndex;
      value >>= 32 - bitCount - bitIndex;
      return value;
    }
    return this.PeekIntFallback(bitCount);
  }

  private PeekIntFallback(bitCount: number): number {
    let value: number = 0;
    let byteIndex: number = this.Position / 8;
    let bitIndex: number = this.Position % 8;

    while (bitCount > 0) {
      if (bitIndex >= 8) {
        bitIndex = 0;
        byteIndex++;
      }

      let bitsToRead: number = Math.min(bitCount, 8 - bitIndex);
      let mask: number = 0xFF >> bitIndex;
      let currentByte: number = (mask & this.dv.getUint8(byteIndex)) >>
        (8 - bitIndex - bitsToRead);

      value = (value << bitsToRead) | currentByte;
      bitIndex += bitsToRead;
      bitCount -= bitsToRead;
    }
    return value;
  }
}

namespace BitReader {
  /**
   * Specifies the bias of an offset binary value. A positive bias can represent one more
   * positive value than negative value, and a negative bias can represent one more
   * negative value than positive value.
   *
   * Example:
   * A 4-bit offset binary value with a positive bias can store
   * the values 8 through -7 inclusive.
   * A 4-bit offset binary value with a negative bias can store
   * the values 7 through -8 inclusive.
   */
  export enum OffsetBias {
    Positive = 1,
    Negative = 0,
  }
}

export default BitReader;
