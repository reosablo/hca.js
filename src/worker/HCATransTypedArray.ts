// convert non-transferable typed array to transferable array buffer
class HCATransTypedArray {
  readonly type: string;
  readonly buffer: ArrayBuffer;
  readonly byteOffset: number;
  readonly length: number;
  static convert(arg: any, transferList: ArrayBuffer[]): any {
    if (this.getType(arg) != null) {
      return new HCATransTypedArray(arg, transferList);
    } else return arg;
  }
  static restore(arg: any): any {
    const type = this.getType(arg);
    if (type != null && type.converted) {
      return (arg as HCATransTypedArray).array;
    } else return arg;
  }
  private static getType(
    arg: any,
  ): { type: string; converted: boolean } | undefined {
    if (arg == null || typeof arg !== "object") return undefined;
    else if (arg instanceof Int8Array) {
      return { converted: false, type: "Int8" };
    } else if (arg instanceof Int16Array) {
      return { converted: false, type: "Int16" };
    } else if (arg instanceof Int32Array) {
      return { converted: false, type: "Int32" };
    } else if (arg instanceof Uint8Array) {
      return { converted: false, type: "Uint8" };
    } else if (arg instanceof Uint16Array) {
      return { converted: false, type: "Uint16" };
    } else if (arg instanceof Uint32Array) {
      return { converted: false, type: "Uint32" };
    } else if (arg instanceof Float32Array) {
      return { converted: false, type: "Float32" };
    } else if (arg instanceof Float64Array) {
      return { converted: false, type: "Float64" };
    } else if (
      arg.buffer instanceof ArrayBuffer && typeof arg.type === "string"
    ) {
      return { converted: true, type: arg.type };
    } else return undefined;
  }
  constructor(
    ta:
      | Int8Array
      | Int16Array
      | Int32Array
      | Uint8Array
      | Uint16Array
      | Uint32Array
      | Float32Array
      | Float64Array,
    transferList: ArrayBuffer[],
  ) {
    const type = HCATransTypedArray.getType(ta);
    if (type != null) this.type = type.type;
    else throw new Error("unexpected type");
    this.buffer = ta.buffer;
    this.byteOffset = ta.byteOffset;
    this.length = ta.length;
    if (!transferList.find((val: ArrayBuffer) => val === this.buffer)) {
      transferList.push(this.buffer);
    }
  }
  get array():
    | Int8Array
    | Int16Array
    | Int32Array
    | Uint8Array
    | Uint16Array
    | Uint32Array
    | Float32Array
    | Float64Array {
    switch (this.type) {
      case "Int8":
        return new Int8Array(this.buffer, this.byteOffset, this.length);
      case "Int16":
        return new Int16Array(this.buffer, this.byteOffset, this.length);
      case "Int32":
        return new Int32Array(this.buffer, this.byteOffset, this.length);
      case "Uint8":
        return new Uint8Array(this.buffer, this.byteOffset, this.length);
      case "Uint16":
        return new Uint16Array(this.buffer, this.byteOffset, this.length);
      case "Uint32":
        return new Uint32Array(this.buffer, this.byteOffset, this.length);
      case "Float32":
        return new Float32Array(this.buffer, this.byteOffset, this.length);
      case "Float64":
        return new Float64Array(this.buffer, this.byteOffset, this.length);
    }
    throw new Error("unexpected type");
  }
}

export default HCATransTypedArray;
