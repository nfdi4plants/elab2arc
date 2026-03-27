/**
 * Webpack configuration for ARCtrl 3.0.1 bundle
 *
 * This bundle is used by elab2arc for:
 * - ARC data model operations (ARCtrl)
 * - Excel file handling (FsSpreadsheet via Xlsx)
 * - In-memory filesystem (memfs)
 *
 * See README.md for build instructions and troubleshooting.
 */
const path = require('path');
const webpack = require('webpack');

// Resolve the actual Xlsx.fs.js path
// Required because ARCtrl's exports field intercepts deep imports
const xlsxPath = path.resolve(__dirname, 'node_modules/@nfdi4plants/arctrl/dist/ts/ts/fable_modules/FsSpreadsheet.Js.7.0.0-alpha.1/Xlsx.fs.js');

module.exports = {
  mode: 'production',
  entry: './src/index.js',
  output: {
    path: path.resolve(__dirname),
    filename: 'arctrl.bundle.js',
    library: {
      type: 'window'  // Exports to window object
    },
    globalObject: 'window'
  },

  // Disable code splitting to produce a single bundle file
  optimization: {
    splitChunks: false
  },

  resolve: {
    // Include .fs.js extension for Fable-compiled files
    extensions: ['.js', '.mjs', '.fs.js'],
    fullySpecified: false,  // Allow imports without extension

    // Browser polyfills for Node.js built-in modules
    fallback: {
      "fs": false,                    // No filesystem in browser
      "fs/promises": false,           // No filesystem promises in browser
      "path": require.resolve("path-browserify"),
      "stream": require.resolve("stream-browserify"),
      "buffer": require.resolve("buffer/"),
      "process": require.resolve("process/browser.js"),
      "process/browser": require.resolve("process/browser.js"),
      "url": false,
      "crypto": false,
      "os": false,
      "events": require.resolve("events/"),
      "util": false
    }
  },

  module: {
    rules: [
      {
        // Handle Fable-compiled .fs.js files
        test: /\.fs\.js$/,
        type: 'javascript/auto'
      }
    ]
  },

  plugins: [
    // Provide global variables for modules that expect them
    new webpack.ProvidePlugin({
      process: require.resolve('process/browser.js'),
      Buffer: ['buffer', 'Buffer']
    }),

    // Rewrite Xlsx import to bypass ARCtrl's exports field
    // This allows direct access to FsSpreadsheet's Xlsx module
    new webpack.NormalModuleReplacementPlugin(
      /fable_modules\/FsSpreadsheet\.Js\.7\.0\.0-alpha\.1\/Xlsx\.fs\.js$/,
      xlsxPath
    )
  ],

  ignoreWarnings: [
    // Ignore warnings about fs/promises (not used in browser)
    /Module not found: Error: Can't resolve 'fs\/promises'/,
    // Ignore dynamic require warnings from ARCtrl
    /Critical dependency: the request of a dependency is an expression/
  ]
};