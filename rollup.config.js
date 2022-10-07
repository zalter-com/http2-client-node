import typescript from '@rollup/plugin-typescript';
import { terser } from 'rollup-plugin-terser';

const external = ['http2'];

const cjsConfig = {
  input: 'src/index.mts',
  output: {
    file: 'lib/cjs/index.js',
    format: 'cjs'
  },
  plugins: [
    typescript({
      tsconfig: './tsconfig.json',
      compilerOptions: {
        outDir: 'lib/cjs'
      }
    }),
    terser()
  ],
  external
};

const esmConfig = {
  input: 'src/index.mts',
  output: {
    format: 'esm',
    file: 'lib/esm/index.mjs'
  },
  plugins: [
    typescript({
      tsconfig: './tsconfig.json'
    }),
    terser(),
  ],
  external
};

export default [
  cjsConfig,
  esmConfig
];
