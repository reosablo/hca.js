import HCAMdct from "../../Utilities/Mdct";
import type HCAChannelType from "./ChannelType";
import {
  SamplesPerSubFrame,
  SubFrameSamplesBits,
  SubframesPerFrame,
} from "./CriHcaConstants";
import HCATables from "./CriHcaTables";

class HCAChannel {
  Type: HCAChannelType = 0;
  CodedScaleFactorCount = 0;
  PcmFloat: Float64Array[] = Array.from(
    { length: SubframesPerFrame },
    () => new Float64Array(SamplesPerSubFrame),
  );
  Spectra: Float64Array[] = Array.from(
    { length: SubframesPerFrame },
    () => new Float64Array(SamplesPerSubFrame),
  );
  ScaledSpectra: Float64Array[] = Array.from({
    length: SamplesPerSubFrame,
  }, () => new Float64Array(SubframesPerFrame));
  QuantizedSpectra: Int32Array[] = Array.from({
    length: SubframesPerFrame,
  }, () => new Int32Array(SamplesPerSubFrame));
  Gain: Float64Array = new Float64Array(SamplesPerSubFrame);
  Intensity: Int32Array = new Int32Array(SubframesPerFrame);
  HfrScales: Int32Array = new Int32Array(8);
  HfrGroupAverageSpectra: Float64Array = new Float64Array(8);
  Mdct: HCAMdct = new HCAMdct(
    SubFrameSamplesBits,
    HCATables.MdctWindow,
    Math.sqrt(2.0 / SamplesPerSubFrame),
  );
  ScaleFactors: Int32Array = new Int32Array(SamplesPerSubFrame);
  Resolution: Int32Array = new Int32Array(SamplesPerSubFrame);
  HeaderLengthBits = 0;
  ScaleFactorDeltaBits = 0;
  constructor(values: Record<string, any>) {
    let t = this as any;
    for (let key in values) {
      t[key] = values[key];
    }
  }
}

export default HCAChannel;
