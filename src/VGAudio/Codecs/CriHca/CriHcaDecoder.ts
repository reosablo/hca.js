import HCABitReader from "../../Utilities/BitReader";
import HCAChannelType from "./ChannelType";
import type HCAChannel from "./CriHcaChannel";
import { SubframesPerFrame } from "./CriHcaConstants";
import HCAFrame from "./CriHcaFrame";
import HCAPacking from "./CriHcaPacking";
import HCATables from "./CriHcaTables";

class HCADecoder {
  static DecodeFrame(audio: Uint8Array, frame: HCAFrame): void {
    let reader = new HCABitReader(audio);
    HCAPacking.UnpackFrame(frame, reader);
    this.DequantizeFrame(frame);
    this.RestoreMissingBands(frame);
    this.RunImdct(frame);
  }

  private static DequantizeFrame(frame: HCAFrame): void {
    for (let channel of frame.Channels) {
      this.CalculateGain(channel);
    }

    for (let sf = 0; sf < SubframesPerFrame; sf++) {
      for (let channel of frame.Channels) {
        for (let s = 0; s < channel.CodedScaleFactorCount; s++) {
          channel.Spectra[sf][s] = channel.QuantizedSpectra[sf][s] *
            channel.Gain[s];
        }
      }
    }
  }

  private static RestoreMissingBands(frame: HCAFrame): void {
    this.ReconstructHighFrequency(frame);
    this.ApplyIntensityStereo(frame);
  }

  private static CalculateGain(channel: HCAChannel): void {
    for (let i = 0; i < channel.CodedScaleFactorCount; i++) {
      channel.Gain[i] =
        HCATables.DequantizerScalingTable[channel.ScaleFactors[i]] *
        HCATables.QuantizerStepSize[channel.Resolution[i]];
    }
  }

  private static ReconstructHighFrequency(frame: HCAFrame): void {
    let hca = frame.Hca;
    if (hca.HfrGroupCount == 0) return;

    // The last spectral coefficient should always be 0;
    let totalBandCount = Math.min(hca.compDec.TotalBandCount, 127);

    let hfrStartBand = hca.compDec.BaseBandCount + hca.compDec.StereoBandCount;
    let hfrBandCount = Math.min(
      hca.compDec.HfrBandCount,
      totalBandCount - hca.compDec.HfrBandCount,
    );

    for (let channel of frame.Channels) {
      if (channel.Type == HCAChannelType.StereoSecondary) continue;

      for (let group = 0, band = 0; group < hca.HfrGroupCount; group++) {
        for (
          let i = 0;
          i < hca.compDec.BandsPerHfrGroup && band < hfrBandCount;
          band++, i++
        ) {
          let highBand = hfrStartBand + band;
          let lowBand = hfrStartBand - band - 1;
          let index = channel.HfrScales[group] - channel.ScaleFactors[lowBand] +
            64;
          for (let sf = 0; sf < SubframesPerFrame; sf++) {
            channel.Spectra[sf][highBand] =
              HCATables.ScaleConversionTable[index] *
              channel.Spectra[sf][lowBand];
          }
        }
      }
    }
  }

  private static ApplyIntensityStereo(frame: HCAFrame): void {
    if (frame.Hca.compDec.StereoBandCount <= 0) return;
    for (let c = 0; c < frame.Channels.length; c++) {
      if (frame.Channels[c].Type != HCAChannelType.StereoPrimary) continue;
      for (let sf = 0; sf < SubframesPerFrame; sf++) {
        let l = frame.Channels[c].Spectra[sf];
        let r = frame.Channels[c + 1].Spectra[sf];
        let ratioL =
          HCATables.IntensityRatioTable[frame.Channels[c + 1].Intensity[sf]];
        let ratioR = ratioL - 2.0;
        for (
          let b = frame.Hca.compDec.BaseBandCount;
          b < frame.Hca.compDec.TotalBandCount;
          b++
        ) {
          r[b] = l[b] * ratioR;
          l[b] *= ratioL;
        }
      }
    }
  }

  private static RunImdct(frame: HCAFrame): void {
    for (let sf = 0; sf < SubframesPerFrame; sf++) {
      for (let channel of frame.Channels) {
        channel.Mdct.RunImdct(channel.Spectra[sf], channel.PcmFloat[sf]);
      }
    }
  }
}

export default HCADecoder;
