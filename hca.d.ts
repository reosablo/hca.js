declare class Mdct {
    MdctBits: number;
    MdctSize: number;
    Scale: number;
    private static _tableBits;
    private static readonly SinTables;
    private static readonly CosTables;
    private static readonly ShuffleTables;
    private readonly _mdctPrevious;
    private readonly _imdctPrevious;
    private readonly _imdctWindow;
    private readonly _scratchMdct;
    private readonly _scratchDct;
    constructor(mdctBits: number, window: Float64Array, scale?: number);
    private static SetTables;
    RunMdct(input: Float64Array, output: Float64Array): void;
    RunImdct(input: Float64Array, output: Float64Array): void;
    /**
     * Does a Type-4 DCT.
     *
     * @param input The input array containing the time or frequency-domain samples
     * @param output The output array that will contain the transformed time or frequency-domain samples
     */
    private Dct4;
    private static GenerateTrigTables;
    private static GenerateShuffleTable;
    // ReSharper disable once UnusedMember.Local
    /**
     * Does a Type-4 DCT. Intended for reference.
     *
     * @param input The input array containing the time or frequency-domain samples
     * @param output The output array that will contain the transformed time or frequency-domain samples
     */
    private Dct4Slow;
}
declare module MdctWrapper {
    export { Mdct };
}
import HCAMdct = MdctWrapper.Mdct;
declare enum HCAChannelType {
    Discrete = 0,
    StereoPrimary = 1,
    StereoSecondary = 2
}
declare class HCAChannel {
    Type: HCAChannelType;
    CodedScaleFactorCount: number;
    PcmFloat: Float64Array[];
    Spectra: Float64Array[];
    ScaledSpectra: Float64Array[];
    QuantizedSpectra: Int32Array[];
    Gain: Float64Array;
    Intensity: Int32Array;
    HfrScales: Int32Array;
    HfrGroupAverageSpectra: Float64Array;
    Mdct: HCAMdct;
    ScaleFactors: Int32Array;
    Resolution: Int32Array;
    HeaderLengthBits: number;
    ScaleFactorDeltaBits: number;
    constructor(values: Record<string, any>);
}
declare class HCAInfo {
    private rawHeader;
    version: string;
    dataOffset: number;
    format: {
        channelCount: number;
        samplingRate: number;
        blockCount: number;
        droppedHeader: number;
        droppedFooter: number;
    };
    blockSize: number;
    hasHeader: Record<string, boolean>;
    headerOffset: Record<string, [
        number,
        number
    ]>; // [start (inclusive), end (exclusive)]
    kbps: number;
    compDec: {
        MinResolution: number;
        MaxResolution: number;
        TrackCount: number;
        ChannelConfig: number;
        TotalBandCount: number;
        BaseBandCount: number;
        StereoBandCount: number;
        HfrBandCount: number;
        BandsPerHfrGroup: number;
        Reserved1: number;
        Reserved2: number;
    };
    dec: {
        DecStereoType: number;
    };
    loop: {
        start: number;
        end: number;
        droppedHeader: number;
        droppedFooter: number;
    };
    vbr: {
        MaxBlockSize: number;
        NoiseLevel: number;
    };
    UseAthCurve: boolean;
    cipher: number;
    rva: number;
    comment: string;
    // computed sample count/offsets
    HfrGroupCount: number;
    fullSampleCount: number;
    startAtSample: number;
    fullEndAtSample: number;
    loopStartAtSample: number;
    loopEndAtSample: number;
    loopSampleCount: number;
    endAtSample: number;
    sampleCount: number;
    // full file size / data part (excluding header, just blocks/frames) size
    fullSize: number;
    dataSize: number;
    // depends on decoding mode (bit count)
    inWavSize?: HCAInfoInWavSize;
    private static getSign;
    clone(): HCAInfo;
    private parseHeader;
    private checkValidity;
    getRawHeader(): Uint8Array;
    private isHeaderChanged;
    modify(hca: Uint8Array, sig: string, newData: Uint8Array): void;
    static addHeader(hca: Uint8Array, sig: string, newData: Uint8Array): Uint8Array;
    static addCipherHeader(hca: Uint8Array, cipherType?: number): Uint8Array;
    static fixHeaderChecksum(hca: Uint8Array): Uint8Array;
    calcInWavSize(mode?: number): HCAInfoInWavSize;
    constructor(hca: Uint8Array, changeMask?: boolean, encrypt?: boolean);
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
declare class HCAFrame {
    Hca: HCAInfo;
    Channels: HCAChannel[];
    AthCurve: Uint8Array;
    AcceptableNoiseLevel: number;
    EvaluationBoundary: number;
    constructor(hca: HCAInfo);
    private static GetChannelTypes;
    /**
     * Scales an ATH curve to the specified frequency.
     *
     * The original ATH curve is for a frequency of 41856 Hz.
     * @param frequency The frequency to scale the curve to.
     * @returns The scaled ATH curve
     */
    private static ScaleAthCurve;
}
declare class HCA {
    constructor();
    static decrypt(hca: Uint8Array, key1?: any, key2?: any): Uint8Array;
    static encrypt(hca: Uint8Array, key1?: any, key2?: any): Uint8Array;
    static decryptOrEncrypt(hca: Uint8Array, encrypt: boolean, key1?: any, key2?: any): Uint8Array;
    static decode(hca: Uint8Array, mode?: number, loop?: number, volume?: number): Uint8Array;
    static decodeBlock(frame: HCAFrame, block: Uint8Array): void;
    static writeToPCM(frame: HCAFrame, mode?: number, volume?: number, writer?: Uint8Array, ftell?: number): Uint8Array;
    static fixChecksum(hca: Uint8Array): Uint8Array;
}
// create & control worker
declare class HCAWorker {
    get isAlive(): boolean;
    private readonly selfUrl;
    private readonly taskQueue;
    private hcaWorker;
    private lastTick;
    shutdown(forcibly?: boolean): Promise<void>;
    tick(): Promise<void>;
    tock(text?: string): Promise<number>;
    static create(selfUrl: URL | string): Promise<HCAWorker>;
    private constructor();
    // commands
    getTransferConfig(): Promise<{
        transferArgs: boolean;
        replyArgs: boolean;
    }>;
    configTransfer(transferArgs: boolean, replyArgs: boolean): Promise<void>;
    fixHeaderChecksum(hca: Uint8Array): Promise<Uint8Array>;
    fixChecksum(hca: Uint8Array): Promise<Uint8Array>;
    decrypt(hca: Uint8Array, key1?: any, key2?: any): Promise<Uint8Array>;
    encrypt(hca: Uint8Array, key1?: any, key2?: any): Promise<Uint8Array>;
    addHeader(hca: Uint8Array, sig: string, newData: Uint8Array): Promise<Uint8Array>;
    addCipherHeader(hca: Uint8Array, cipherType?: number): Promise<Uint8Array>;
    decode(hca: Uint8Array, mode?: number, loop?: number, volume?: number): Promise<Uint8Array>;
}
export { HCA, HCAInfo, HCAWorker };
