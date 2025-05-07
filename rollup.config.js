import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import { terser } from '@rollup/plugin-terser';

export default {
  input: 'src/index.js',
  output: {
    file: 'src/bundle.js',
    format: 'iife',
    name: 'AppBundle',
    sourcemap: true
  },
  plugins: [
    resolve(),
    commonjs(),
    terser()
  ]
}; 