// @ts-check
import ts from "rollup-plugin-ts";

/** @type {import("rollup").RollupOptions} */
export default {
  input: 'src/index.ts',
  output: { file: 'hca.js' },
  plugins: [ts()],
};
