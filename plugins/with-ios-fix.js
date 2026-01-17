const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const withIosPodfileFix = (config) => {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const podfile = path.join(config.modRequest.platformProjectRoot, 'Podfile');
      
      if (!fs.existsSync(podfile)) {
        return config;
      }

      let contents = await fs.promises.readFile(podfile, 'utf8');

      // Ensure we don't duplicate the block
      if (contents.includes('# MatchCars Build Fix')) {
        return config;
      }

      const regex = /post_install\s*do\s*\|([^|]+)\|/;
      const match = contents.match(regex);

      if (match) {
        const installerName = match[1];
        const fix = `
    # MatchCars Build Fix
    ${installerName}.pods_project.targets.each do |target|
      target.build_configurations.each do |config|
        # Allow non-modular includes (critical for React Native + Static Frameworks)
        config.build_settings['CLANG_ALLOW_NON_MODULAR_INCLUDES_IN_FRAMEWORK_MODULES'] = 'YES'
        
        # Compatibility flags
        config.build_settings['GCC_PREPROCESSOR_DEFINITIONS'] ||= ['$(inherited)', '_LIBCPP_ENABLE_CXX17_REMOVED_UNARY_BINARY_FUNCTION']

        # Fix for New Architecture + Static Frameworks
        cflags = config.build_settings['OTHER_CFLAGS'] || ['$(inherited)']
        cflags = cflags.is_a?(Array) ? cflags : [cflags]
        cflags << '-Wno-implicit-int'
        cflags << '-Wno-strict-prototypes'
        cflags << '-Wno-deprecated-declarations'
        cflags << '-Wno-shorten-64-to-32'
        config.build_settings['OTHER_CFLAGS'] = cflags

        # C++ Specific flags (Force C++17 correctly without breaking C libs like libwebp)
        cxxflags = config.build_settings['OTHER_CPLUSPLUSFLAGS'] || ['$(inherited)']
        cxxflags = cxxflags.is_a?(Array) ? cxxflags : [cxxflags]
        cxxflags << '-std=gnu++17'
        config.build_settings['OTHER_CPLUSPLUSFLAGS'] = cxxflags

        # Disable strict checking

        # Disable strict checking
        config.build_settings['GCC_TREAT_WARNINGS_AS_ERRORS'] = 'NO'
      end
    end
`;
        contents = contents.replace(match[0], `${match[0]}${fix}`);
        await fs.promises.writeFile(podfile, contents);
      }

      return config;
    },
  ]);
};

module.exports = withIosPodfileFix;
