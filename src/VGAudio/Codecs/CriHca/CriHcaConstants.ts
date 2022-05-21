export const SubframesPerFrame = 8;
export const SubFrameSamplesBits = 7;
export const SamplesPerSubFrame = 1 << SubFrameSamplesBits;
export const SamplesPerFrame = SubframesPerFrame *
  SamplesPerSubFrame;
