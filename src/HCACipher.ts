class HCACipher {
  static readonly defKey1 = 0x01395C51;
  static readonly defKey2 = 0x00000000;
  private cipherType = 0;
  private encrypt = false;
  private key1buf = new ArrayBuffer(4);
  private key2buf = new ArrayBuffer(4);
  private dv1: DataView;
  private dv2: DataView;
  private _table = new Uint8Array(256);
  private init1(): void {
    for (let i = 1, v = 0; i < 0xFF; i++) {
      v = (v * 13 + 11) & 0xFF;
      if (v == 0 || v == 0xFF) v = (v * 13 + 11) & 0xFF;
      this._table[i] = v;
    }
    this._table[0] = 0;
    this._table[0xFF] = 0xFF;
  }
  private init56(): void {
    let key1 = this.getKey1();
    let key2 = this.getKey2();
    if (!key1) key2--;
    key1--;
    this.dv1.setUint32(0, key1, true);
    this.dv2.setUint32(0, key2, true);
    let t1 = this.getBytesOfTwoKeys();
    let t2 = new Uint8Array([
      t1[1], t1[1] ^ t1[6], t1[2] ^ t1[3],
      t1[2], t1[2] ^ t1[1], t1[3] ^ t1[4],
      t1[3], t1[3] ^ t1[2], t1[4] ^ t1[5],
      t1[4], t1[4] ^ t1[3], t1[5] ^ t1[6],
      t1[5], t1[5] ^ t1[4], t1[6] ^ t1[1],
      t1[6]
    ]);
    let t3 = new Uint8Array(0x100);
    let t31 = new Uint8Array(0x10);
    let t32 = new Uint8Array(0x10);
    this.createTable(t31, t1[0]);
    for (let i = 0, t = 0; i < 0x10; i++) {
      this.createTable(t32, t2[i]);
      let v = t31[i] << 4;
      for (let j = 0; j < 0x10; j++) {
        t3[t++] = v | t32[j];
      }
    }
    for (let i = 0, v = 0, t = 1; i < 0x100; i++) {
      v = (v + 0x11) & 0xFF;
      let a = t3[v];
      if (a != 0 && a != 0xFF) this._table[t++] = a;
    }
    this._table[0] = 0;
    this._table[0xFF] = 0xFF;
  }
  private createTable(r: Uint8Array, key: number): void {
    let mul = ((key & 1) << 3) | 5;
    let add = (key & 0xE) | 1;
    let t = 0;
    key >>= 4;
    for (let i = 0; i < 0x10; i++) {
      key = (key * mul + add) & 0xF;
      r[t++] = key;
    }
  }
  invertTable(): HCACipher {
    // actually, this method switch the mode between encrypt/decrypt
    this.encrypt = !this.encrypt;
    let _old_table = this._table.slice(0);
    let bitMap = new Uint16Array(16);
    for (let i = 0; i < 256; i++) {
      // invert key and value
      let key = _old_table[i];
      let val = i;
      // check for inconsistency
      let higher4 = key >> 4 & 0x0F;
      let lower4 = key & 0x0F;
      let flag = 0x01 << lower4;
      if (bitMap[higher4] & flag) throw new Error("_table is not bijective");
      // update table
      this._table[key] = val;
    }
    return this;
  }
  getType(): number {
    return this.cipherType;
  }
  getEncrypt(): boolean {
    return this.encrypt;
  }
  getKey1(): number {
    return this.dv1.getUint32(0, true);
  }
  getKey2(): number {
    return this.dv2.getUint32(0, true);
  }
  getBytesOfTwoKeys(): Uint8Array {
    let buf = new Uint8Array(8);
    buf.set(new Uint8Array(this.key1buf), 0);
    buf.set(new Uint8Array(this.key2buf), 4);
    return buf;
  }
  setKey1(key: number): HCACipher {
    this.dv1.setUint32(0, key, true);
    this.init56();
    this.cipherType = 0x38;
    return this;
  }
  setKey2(key: number): HCACipher {
    this.dv2.setUint32(0, key, true);
    this.init56();
    this.cipherType = 0x38;
    return this;
  }
  setKeys(key1: number, key2: number): HCACipher {
    this.dv1.setUint32(0, key1, true);
    this.dv2.setUint32(0, key2, true);
    this.init56();
    this.cipherType = 0x38;
    return this;
  }
  setToDefKeys(): HCACipher {
    return this.setKeys(HCACipher.defKey1, HCACipher.defKey2);
  }
  setToNoKey(): HCACipher {
    this.init1();
    this.cipherType = 0x01;
    return this;
  }
  mask(block: Uint8Array, offset: number, size: number): void {
    // encrypt or decrypt block data
    for (let i = 0; i < size; i++) {
      block[offset + i] = this._table[block[offset + i]];
    }
  }
  static isHCAHeaderMasked(hca: Uint8Array): boolean {
    // fast & dirty way to determine whether encrypted, not recommended
    if (hca[0] & 0x80 || hca[1] & 0x80 || hca[2] & 0x80) return true;
    else return false;
  }
  static parseKey(key: any): number {
    switch (typeof key) {
      case "number":
        return key;
      case "string":
        // avoid ambiguity: always treat as hex
        if (!key.match(/^0x/)) key = "0x" + key;
        key = parseInt(key);
        if (isNaN(key)) throw new Error("cannot parse as integer");
        return key;
      case "object":
        // avoid endianness ambiguity: only accepting Uint8Array, then read as little endian
        if (key instanceof Uint8Array && key.byteLength == 4) {
          return new DataView(key.buffer, key.byteOffset, key.byteLength)
            .getUint32(0, true);
        }
      default:
        throw new Error("can only accept number/hex string/Uint8Array[4]");
    }
  }
  constructor(key1?: any, key2?: any) {
    this.dv1 = new DataView(this.key1buf);
    this.dv2 = new DataView(this.key2buf);
    if (key1 == null) {
      throw new Error(
        'no keys given. use "defaultkey" if you want to use the default key',
      );
    }
    switch (key1) {
      case "none":
      case "nokey":
      case "noKey":
      case "no key":
      case "no_Key":
        this.setToNoKey();
        break;
      case "defaultkey":
      case "defaultKey":
      case "default key":
      case "default_key":
        this.setToDefKeys();
        break;
      default:
        key1 = HCACipher.parseKey(key1);
        if (key2 == null) {
          key2 = 0;
        } else {
          key2 = HCACipher.parseKey(key2);
        }
        this.setKeys(key1, key2);
    }
  }
}

export default HCACipher;
