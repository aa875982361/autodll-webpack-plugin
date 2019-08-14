import { strategy } from 'webpack-merge';
import { DllPlugin } from 'webpack';
import path from 'path';
import { cacheDir } from './paths';

import reject from 'lodash/reject';
import get from 'lodash/get';
import omit from 'lodash/omit';

import mapParentConfig from './mapParentConfig';

const webpackMerge = strategy({
  entry: 'append',
  output: 'append',
  plugins: 'append',
});

// omit properties that can break things
const prepare = config => {
  // We don't want are own plugin in the DLL config
  const plugins = reject(
    config.plugins,
    plugin => get(plugin, 'constructor.name') === 'AutoDLLPlugin'
  );

  // context is omitted becouse we already assigned the parent context as the defaults in createSettings
  // plugins are ommited by default too.
  // It's not ideal, but it's better to let the user make a conscious choice about it.
  const props = ['context', 'plugins', 'entry', 'output'];
  return { ...omit(config, props), plugins };
};

export const _createConfig = cacheDir => (settings, rawParentConfig) => {
  const { hash, filename = [], libraryTarget = undefined } = settings;
  const outputPath = path.join(cacheDir, hash);

  const parentConfig = mapParentConfig(settings, prepare(rawParentConfig));

  let dllExportNamePre = '';
  let outputParams = {};
  // 判断是否有设置一个暴露出的全局变量
  /**
   * libraryTarget == ”global“的时候存在一个问题，生成的dll文件是 window.vendor_hash = function(){}
   * 正确应该是要生成 global.vendor_hash = function(){}
   * 根据我的尝试 只要再设置一个 globalObject 就可以正确生成文件
   * 另外 为了要适配小程序的使用，我在mainifest.json文件中 设置了变量名为 global.[name]_[hash]
   */
  if (libraryTarget == 'global') {
    dllExportNamePre = libraryTarget + '.';
    outputParams = {
      globalObject: libraryTarget, //全局对象配置
      libraryTarget,
    };
  }

  const ownConfig = {
    context: settings.context,
    entry: settings.entry,
    plugins: [
      ...(settings.plugins || []),
      new DllPlugin({
        path: path.join(outputPath, '[name].manifest.json'),
        name: dllExportNamePre + '[name]_[chunkhash]',
      }),
    ],
    output: {
      filename: filename,
      library: '[name]_[chunkhash]',
      // ...outputParams,
      ...outputParams,
    },
  };

  const advanceConfig = settings.config;

  const cacheConfig = {
    // The user is not allowed to change output.path
    // otherwise bad things will happen.
    // (this is the path for the cache)
    output: {
      path: outputPath,
    },
  };

  return webpackMerge(parentConfig, ownConfig, advanceConfig, cacheConfig);
};

export default _createConfig(cacheDir);
