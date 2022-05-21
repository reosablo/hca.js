export function DivideByRoundUp(value: number, divisor: number): number {
  return Math.ceil(value / divisor);
}

export function GetHighNibble(value: number): number {
  if (value > 0xff) throw new Error();
  if (value < -0x80) throw new Error();
  return (value >>> 4) & 0xF;
}

export function GetLowNibble(value: number): number {
  if (value > 0xff) throw new Error();
  if (value < -0x80) throw new Error();
  return value & 0xF;
}

const SignedNibbles = [0, 1, 2, 3, 4, 5, 6, 7, -8, -7, -6, -5, -4, -3, -2, -1] as const;

export function GetHighNibbleSigned(value: number) {
  if (value > 0xff) throw new Error();
  if (value < -0x80) throw new Error();
  return SignedNibbles[(value >>> 4) & 0xF];
}

export function GetLowNibbleSigned(value: number) {
  if (value > 0xff) throw new Error();
  if (value < -0x80) throw new Error();
  return SignedNibbles[value & 0xF];
}

export function CombineNibbles(high: number, low: number) {
  return ((high << 4) | (low & 0xF)) & 0xFF;
}

export function GetNextMultiple(value: number, multiple: number): number {
  if (multiple <= 0) {
    return value;
  }

  if (value % multiple == 0) {
    return value;
  }

  return value + multiple - value % multiple;
}

export function SignedBitReverse32(value: number): number {
  if (value > 0xffffffff) throw new Error();
  if (value < -0x80000000) throw new Error();
  value = ((value & 0xaaaaaaaa) >>> 1) | ((value & 0x55555555) << 1);
  value = ((value & 0xcccccccc) >>> 2) | ((value & 0x33333333) << 2);
  value = ((value & 0xf0f0f0f0) >>> 4) | ((value & 0x0f0f0f0f) << 4);
  value = ((value & 0xff00ff00) >>> 8) | ((value & 0x00ff00ff) << 8);
  return ((value & 0xffff0000) >>> 16) | ((value & 0x0000ffff) << 16);
}

export function UnsignedBitReverse32(value: number): number {
  return SignedBitReverse32(value) >>> 0;
}

export function UnsignedBitReverse32Trunc(
  value: number,
  bitCount: number,
): number {
  return UnsignedBitReverse32(value) >>> (32 - bitCount);
}

export function SignedBitReverse32Trunc(
  value: number,
  bitCount: number,
): number {
  return UnsignedBitReverse32Trunc(value >>> 0, bitCount);
}

export function BitReverse8(value: number): number {
  if (value > 0xff) throw new Error();
  if (value < -0x80) throw new Error();
  value >>>= 0;
  value = ((value & 0xaa) >>> 1) | ((value & 0x55) << 1);
  value = ((value & 0xcc) >>> 2) | ((value & 0x33) << 2);
  return (((value & 0xf0) >>> 4) | ((value & 0x0f) << 4)) >>> 0;
}

export function Clamp(value: number, min: number, max: number): number {
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
}

export function DebugAssert(condition: any) {
  if (!condition) throw new Error("DebugAssert failed");
}
