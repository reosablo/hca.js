import HCABitReader from "../../Utilities/BitReader";
import HCABitWriter from "../../Utilities/BitWriter";
import HCACrc16 from "../../Utilities/Crc16";
import * as HCAUtilFunc from "../../Utilities/Helpers";
import HCAChannelType from "./ChannelType";
import type HCAChannel from "./CriHcaChannel";
import { SubframesPerFrame } from "./CriHcaConstants";
import HCAFrame from "./CriHcaFrame";
import HCATables from "./CriHcaTables";

class HCAPacking {
  public static UnpackFrame(frame: HCAFrame, reader: HCABitReader): boolean {
    if (!this.UnpackFrameHeader(frame, reader)) return false;
    this.ReadSpectralCoefficients(frame, reader);
    return this.UnpackingWasSuccessful(frame, reader);
  }

  public static PackFrame(frame: HCAFrame, outBuffer: Uint8Array): void {
    var writer = new HCABitWriter(outBuffer);
    writer.Write(0xffff, 16);
    writer.Write(frame.AcceptableNoiseLevel, 9);
    writer.Write(frame.EvaluationBoundary, 7);

    for (let channel of frame.Channels) {
      this.WriteScaleFactors(writer, channel);
      if (channel.Type == HCAChannelType.StereoSecondary) {
        for (let i = 0; i < SubframesPerFrame; i++) {
          writer.Write(channel.Intensity[i], 4);
        }
      } else if (frame.Hca.HfrGroupCount > 0) {
        for (let i = 0; i < frame.Hca.HfrGroupCount; i++) {
          writer.Write(channel.HfrScales[i], 6);
        }
      }
    }

    for (let sf = 0; sf < SubframesPerFrame; sf++) {
      for (let channel of frame.Channels) {
        this.WriteSpectra(writer, channel, sf);
      }
    }

    writer.AlignPosition(8);
    for (let i = writer.Position / 8; i < frame.Hca.blockSize - 2; i++) {
      writer.dv.setUint8(i, 0);
    }

    this.WriteChecksum(writer, outBuffer);
  }

  public static CalculateResolution(
    scaleFactor: number,
    noiseLevel: number,
  ): number {
    if (scaleFactor == 0) {
      return 0;
    }
    let curvePosition = noiseLevel - (5 * scaleFactor >> 1) + 2;
    curvePosition = HCAUtilFunc.Clamp(curvePosition, 0, 58);
    return HCATables.ScaleToResolutionCurve[curvePosition];
  }

  private static UnpackFrameHeader(
    frame: HCAFrame,
    reader: HCABitReader,
  ): boolean {
    let syncWord = reader.ReadInt(16);
    if (syncWord != 0xffff) {
      throw new Error("Invalid frame header");
    }

    let athCurve = frame.AthCurve;
    frame.AcceptableNoiseLevel = reader.ReadInt(9);
    frame.EvaluationBoundary = reader.ReadInt(7);

    for (let channel of frame.Channels) {
      if (!this.ReadScaleFactors(channel, reader)) return false;

      for (let i = 0; i < frame.EvaluationBoundary; i++) {
        channel.Resolution[i] = this.CalculateResolution(
          channel.ScaleFactors[i],
          athCurve[i] + frame.AcceptableNoiseLevel - 1,
        );
      }

      for (
        let i = frame.EvaluationBoundary;
        i < channel.CodedScaleFactorCount;
        i++
      ) {
        channel.Resolution[i] = this.CalculateResolution(
          channel.ScaleFactors[i],
          athCurve[i] + frame.AcceptableNoiseLevel,
        );
      }

      if (channel.Type == HCAChannelType.StereoSecondary) {
        this.ReadIntensity(reader, channel.Intensity);
      } else if (frame.Hca.HfrGroupCount > 0) {
        this.ReadHfrScaleFactors(
          reader,
          frame.Hca.HfrGroupCount,
          channel.HfrScales,
        );
      }
    }
    return true;
  }

  private static ReadScaleFactors(
    channel: HCAChannel,
    reader: HCABitReader,
  ): boolean {
    channel.ScaleFactorDeltaBits = reader.ReadInt(3);
    if (channel.ScaleFactorDeltaBits == 0) {
      channel.ScaleFactors.fill(0, 0, channel.ScaleFactors.length);
      return true;
    }

    if (channel.ScaleFactorDeltaBits >= 6) {
      for (let i = 0; i < channel.CodedScaleFactorCount; i++) {
        channel.ScaleFactors[i] = reader.ReadInt(6);
      }
      return true;
    }

    return this.DeltaDecode(
      reader,
      channel.ScaleFactorDeltaBits,
      6,
      channel.CodedScaleFactorCount,
      channel.ScaleFactors,
    );
  }

  private static ReadIntensity(
    reader: HCABitReader,
    intensity: Int32Array,
  ): void {
    for (let i = 0; i < SubframesPerFrame; i++) {
      intensity[i] = reader.ReadInt(4);
    }
  }

  private static ReadHfrScaleFactors(
    reader: HCABitReader,
    groupCount: number,
    hfrScale: Int32Array,
  ): void {
    for (let i = 0; i < groupCount; i++) {
      hfrScale[i] = reader.ReadInt(6);
    }
  }

  private static ReadSpectralCoefficients(
    frame: HCAFrame,
    reader: HCABitReader,
  ): void {
    for (let sf = 0; sf < SubframesPerFrame; sf++) {
      for (let channel of frame.Channels) {
        for (let s = 0; s < channel.CodedScaleFactorCount; s++) {
          let resolution = channel.Resolution[s];
          let bits = HCATables.QuantizedSpectrumMaxBits[resolution];
          let code = reader.PeekInt(bits);
          if (resolution < 8) {
            bits = HCATables.QuantizedSpectrumBits[resolution][code];
            channel.QuantizedSpectra[sf][s] =
              HCATables.QuantizedSpectrumValue[resolution][code];
          } else {
            // Read the sign-magnitude value. The low bit is the sign
            let quantizedCoefficient = (code >> 1) * (1 - (code % 2 * 2));
            if (quantizedCoefficient == 0) {
              bits--;
            }
            channel.QuantizedSpectra[sf][s] = quantizedCoefficient;
          }
          reader.Position += bits;
        }

        channel.Spectra[sf].fill(
          0,
          channel.CodedScaleFactorCount,
          channel.CodedScaleFactorCount + 0x80 - channel.CodedScaleFactorCount,
        );
      }
    }
  }

  private static DeltaDecode(
    reader: HCABitReader,
    deltaBits: number,
    dataBits: number,
    count: number,
    output: Int32Array,
  ): boolean {
    output[0] = reader.ReadInt(dataBits);
    let maxDelta = 1 << (deltaBits - 1);
    let maxValue = (1 << dataBits) - 1;

    for (let i = 1; i < count; i++) {
      let delta = reader.ReadOffsetBinary(
        deltaBits,
        HCABitReader.OffsetBias.Positive,
      );

      if (delta < maxDelta) {
        let value = output[i - 1] + delta;
        if (value < 0 || value > maxValue) {
          return false;
        }
        output[i] = value;
      } else {
        output[i] = reader.ReadInt(dataBits);
      }
    }
    return true;
  }

  private static UnpackingWasSuccessful(
    frame: HCAFrame,
    reader: HCABitReader,
  ): boolean {
    // 128 leftover bits after unpacking should be high enough to get rid of false negatives,
    // and low enough that false positives will be uncommon.
    return reader.Remaining >= 16 && reader.Remaining <= 128 ||
      this.FrameEmpty(frame) ||
      frame.AcceptableNoiseLevel == 0 && reader.Remaining >= 16;
  }

  private static FrameEmpty(frame: HCAFrame): boolean {
    if (frame.AcceptableNoiseLevel > 0) return false;

    // If all the scale factors are 0, the frame is empty
    for (let channel of frame.Channels) {
      if (channel.ScaleFactorDeltaBits > 0) {
        return false;
      }
    }
    return true;
  }

  private static WriteChecksum(
    writer: HCABitWriter,
    hcaBuffer: Uint8Array,
  ): void {
    writer.Position = writer.LengthBits - 16;
    let crc16 = HCACrc16.calc(hcaBuffer, hcaBuffer.length - 2);
    writer.Write(crc16, 16);
  }

  private static WriteSpectra(
    writer: HCABitWriter,
    channel: HCAChannel,
    subFrame: number,
  ): void {
    for (let i = 0; i < channel.CodedScaleFactorCount; i++) {
      let resolution = channel.Resolution[i];
      let quantizedSpectra = channel.QuantizedSpectra[subFrame][i];
      if (resolution == 0) continue;
      if (resolution < 8) {
        let bits =
          HCATables.QuantizeSpectrumBits[resolution][quantizedSpectra + 8];
        writer.Write(
          HCATables.QuantizeSpectrumValue[resolution][quantizedSpectra + 8],
          bits,
        );
      } else if (resolution < 16) {
        let bits = HCATables.QuantizedSpectrumMaxBits[resolution] - 1;
        writer.Write(Math.abs(quantizedSpectra), bits);
        if (quantizedSpectra != 0) {
          writer.Write(quantizedSpectra > 0 ? 0 : 1, 1);
        }
      }
    }
  }

  private static WriteScaleFactors(
    writer: HCABitWriter,
    channel: HCAChannel,
  ): void {
    let deltaBits = channel.ScaleFactorDeltaBits;
    let scales = channel.ScaleFactors;
    writer.Write(deltaBits, 3);
    if (deltaBits == 0) return;

    if (deltaBits == 6) {
      for (let i = 0; i < channel.CodedScaleFactorCount; i++) {
        writer.Write(scales[i], 6);
      }
      return;
    }

    writer.Write(scales[0], 6);
    let maxDelta = (1 << (deltaBits - 1)) - 1;
    let escapeValue = (1 << deltaBits) - 1;

    for (let i = 1; i < channel.CodedScaleFactorCount; i++) {
      let delta = scales[i] - scales[i - 1];
      if (Math.abs(delta) > maxDelta) {
        writer.Write(escapeValue, deltaBits);
        writer.Write(scales[i], 6);
      } else {
        writer.Write(maxDelta + delta, deltaBits);
      }
    }
  }
}

export default HCAPacking;
