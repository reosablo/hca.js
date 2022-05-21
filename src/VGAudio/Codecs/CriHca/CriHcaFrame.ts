import HCAChannelType from "./ChannelType";
import HCAChannel from "./CriHcaChannel";
import { SamplesPerSubFrame } from "./CriHcaConstants";
import HCATables from "./CriHcaTables";
import type HCAInfo from "./HcaInfo";

class HCAFrame {
  Hca: HCAInfo;
  Channels: HCAChannel[];
  AthCurve: Uint8Array;
  AcceptableNoiseLevel: number = 0;
  EvaluationBoundary: number = 0;

  constructor(hca: HCAInfo) {
    this.Hca = hca;
    let channelTypes = HCAFrame.GetChannelTypes(hca);
    this.Channels = [];

    for (let i = 0; i < hca.format.channelCount; i++) {
      this.Channels.push(
        new HCAChannel({
          Type: channelTypes[i],
          CodedScaleFactorCount:
            channelTypes[i] == HCAChannelType.StereoSecondary
              ? hca.compDec.BaseBandCount
              : hca.compDec.BaseBandCount + hca.compDec.StereoBandCount,
        }),
      );
    }

    this.AthCurve = hca.UseAthCurve
      ? HCAFrame.ScaleAthCurve(hca.format.samplingRate)
      : new Uint8Array(SamplesPerSubFrame);
  }

  private static GetChannelTypes(hca: HCAInfo): HCAChannelType[] {
    let channelsPerTrack = hca.format.channelCount / hca.compDec.TrackCount;
    if (hca.compDec.StereoBandCount == 0 || channelsPerTrack == 1) {
      return new Array(8).fill(HCAChannelType);
    }

    const Discrete = HCAChannelType.Discrete;
    const StereoPrimary = HCAChannelType.StereoPrimary;
    const StereoSecondary = HCAChannelType.StereoSecondary;
    switch (channelsPerTrack) {
      case 2:
        return [StereoPrimary, StereoSecondary];
      case 3:
        return [StereoPrimary, StereoSecondary, Discrete];
      case 4:
        if (hca.compDec.ChannelConfig != 0) {
          return [StereoPrimary, StereoSecondary, Discrete, Discrete];
        } else {
          return [
            StereoPrimary,
            StereoSecondary,
            StereoPrimary,
            StereoSecondary,
          ];
        }
      case 5:
        if (hca.compDec.ChannelConfig > 2) {
          return [StereoPrimary, StereoSecondary, Discrete, Discrete, Discrete];
        } else {
          return [
            StereoPrimary,
            StereoSecondary,
            Discrete,
            StereoPrimary,
            StereoSecondary,
          ];
        }
      case 6:
        return [
          StereoPrimary,
          StereoSecondary,
          Discrete,
          Discrete,
          StereoPrimary,
          StereoSecondary,
        ];
      case 7:
        return [
          StereoPrimary,
          StereoSecondary,
          Discrete,
          Discrete,
          StereoPrimary,
          StereoSecondary,
          Discrete,
        ];
      case 8:
        return [
          StereoPrimary,
          StereoSecondary,
          Discrete,
          Discrete,
          StereoPrimary,
          StereoSecondary,
          StereoPrimary,
          StereoSecondary,
        ];
      default:
        return new Array(channelsPerTrack).fill(HCAChannelType);
    }
  }

  /**
   * Scales an ATH curve to the specified frequency.
   *
   * The original ATH curve is for a frequency of 41856 Hz.
   * @param frequency The frequency to scale the curve to.
   * @returns The scaled ATH curve
   */
  private static ScaleAthCurve(frequency: number): Uint8Array {
    var ath = new Uint8Array(SamplesPerSubFrame);

    let acc = 0;
    let i;
    for (i = 0; i < ath.length; i++) {
      acc += frequency;
      let index = acc >> 13;

      if (index >= HCATables.AthCurve.length) {
        break;
      }
      ath[i] = HCATables.AthCurve[index];
    }

    for (; i < ath.length; i++) {
      ath[i] = 0xff;
    }

    return ath;
  }
}

export default HCAFrame;
