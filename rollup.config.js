import typescript from '@rollup/plugin-typescript';
import { terser } from 'rollup-plugin-terser';

const esmConfig = {
  input: 'src/index.ts',
  output: {
    format: 'esm',
    file: 'lib/index.mjs'
  },
  plugins: [
    typescript({
      tsconfig: './tsconfig.json'
    }),
    terser()
  ],
  external: ['http2']
};

export default [
  esmConfig
];
