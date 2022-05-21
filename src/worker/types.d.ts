// AudioWorkletProcessor types declaration

// ref: https://github.com/microsoft/TypeScript/issues/28308#issuecomment-650802278
interface AudioWorkletProcessor {
  readonly port: MessagePort;
  process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: Record<string, Float32Array>,
  ): boolean;
}
declare var AudioWorkletProcessor: {
  prototype: AudioWorkletProcessor;
  new (options?: AudioWorkletNodeOptions): AudioWorkletProcessor;
};
// ref: https://chromium.googlesource.com/devtools/devtools-frontend/+/f18c0ac2f735bd0b1385398c7e52b8ba01a5d796/node_modules/typescript/lib/lib.dom.d.ts
interface AudioParamDescriptor {
  automationRate?: AutomationRate;
  defaultValue?: number;
  maxValue?: number;
  minValue?: number;
  name: string;
}
// ref: https://github.com/microsoft/TypeScript/issues/28308#issuecomment-757335303
declare function registerProcessor(
  name: string,
  processorCtor:
    & (new (
      options?: AudioWorkletNodeOptions,
    ) => AudioWorkletProcessor)
    & {
      parameterDescriptors?: AudioParamDescriptor[];
    },
): undefined;
