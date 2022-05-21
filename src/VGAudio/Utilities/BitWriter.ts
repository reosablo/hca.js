import * as HCAUtilFunc from "./Helpers";

class BitWriter {
  Buffer: Uint8Array;
  dv: DataView;
  LengthBits: number;
  Position = 0;
  get Remaining(): number {
    return this.LengthBits - this.Position;
  }

  constructor(buffer: Uint8Array) {
    this.Buffer = buffer;
    this.dv = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    this.LengthBits = buffer.length * 8;
  }

  public AlignPosition(multiple: number): void {
    let newPosition = HCAUtilFunc.GetNextMultiple(this.Position, multiple);
    let bits = newPosition - this.Position;
    this.Write(0, bits);
  }

  public Write(value: number, bitCount: number): void {
    HCAUtilFunc.DebugAssert(bitCount >= 0 && bitCount <= 32);

    if (bitCount > this.Remaining) {
      throw new Error("Not enough bits left in output buffer");
    }

    let byteIndex = this.Position / 8;
    let bitIndex = this.Position % 8;

    if (bitCount <= 9 && this.Remaining >= 16) {
      let outValue = ((value << (16 - bitCount)) & 0xFFFF) >> bitIndex;
      outValue |= this.dv.getUint16(byteIndex);
      this.dv.setUint16(byteIndex, outValue);
    } else if (bitCount <= 17 && this.Remaining >= 24) {
      let outValue = ((value << (24 - bitCount)) & 0xFFFFFF) >> bitIndex;
      outValue |= this.dv.getUint16(byteIndex) << 8 |
        this.dv.getUint8(byteIndex + 2);
      this.dv.setUint16(byteIndex, outValue >>> 8);
      this.dv.setUint8(byteIndex + 2, outValue & 0xFF);
    } else if (bitCount <= 25 && this.Remaining >= 32) {
      let outValue = (((value << (32 - bitCount)) & 0xFFFFFFFF) >>> bitIndex);
      outValue |= this.dv.getUint32(byteIndex);
      this.dv.setUint32(byteIndex, outValue);
    } else {
      this.WriteFallback(value, bitCount);
    }

    this.Position += bitCount;
  }

  private WriteFallback(value: number, bitCount: number): void {
    let byteIndex = this.Position / 8;
    let bitIndex = this.Position % 8;

    while (bitCount > 0) {
      if (bitIndex >= 8) {
        bitIndex = 0;
        byteIndex++;
      }

      let toShift = 8 - bitIndex - bitCount;
      let shifted = toShift < 0 ? value >>> -toShift : value << toShift;
      let bitsToWrite = Math.min(bitCount, 8 - bitIndex);

      let mask = ((1 << bitsToWrite) - 1) << 8 - bitIndex - bitsToWrite;
      let outByte = this.dv.getUint8(byteIndex) & ~mask;
      outByte |= shifted & mask;
      this.dv.setUint8(byteIndex, outByte);

      bitIndex += bitsToWrite;
      bitCount -= bitsToWrite;
    }
  }
}

export default BitWriter;
