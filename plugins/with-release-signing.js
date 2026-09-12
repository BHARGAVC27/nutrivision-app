const { withAppBuildGradle } = require('expo/config-plugins');

/**
 * Release signing and per-ABI APKs for the Android app.
 *
 * Expo's generated `android/app/build.gradle` signs *release* builds with the
 * debug keystore, which no phone should be handed. This adds a `nvRelease`
 * signing config read from `credentials/keystore.properties` (kept out of
 * git) and uses it for the release build type. If the file is missing the
 * build still succeeds, signed with the debug key, and says so loudly.
 *
 * It also splits the release APK per ABI (`app-arm64-v8a-release.apk` for
 * phones, `app-x86_64-release.apk` for the emulator) so nobody sideloads
 * 300 MB of native libraries for four architectures they do not have. The
 * App Bundle (`bundleRelease`) is unaffected — Play does its own splitting.
 *
 * Generate the keystore once (see scripts/make-keystore.sh) and keep it —
 * a lost keystore means the next version cannot update the installed one.
 */

const MARKER = '// nutrivision: release signing + per-ABI APKs';

function withReleaseSigning(config) {
  return withAppBuildGradle(config, (cfg) => {
    if (cfg.modResults.language !== 'groovy') {
      throw new Error('[nutrivision] with-release-signing expects a Groovy app build.gradle');
    }
    if (!cfg.modResults.contents.includes(MARKER)) {
      cfg.modResults.contents += `
${MARKER}
def nvKeystoreProps = new Properties()
def nvKeystorePropsFile = rootProject.file('../credentials/keystore.properties')
if (nvKeystorePropsFile.exists()) {
  nvKeystorePropsFile.withInputStream { nvKeystoreProps.load(it) }
  android {
    signingConfigs {
      nvRelease {
        storeFile rootProject.file('../credentials/' + nvKeystoreProps['storeFile'])
        storePassword nvKeystoreProps['storePassword']
        keyAlias nvKeystoreProps['keyAlias']
        keyPassword nvKeystoreProps['keyPassword']
      }
    }
    buildTypes {
      release {
        signingConfig signingConfigs.nvRelease
      }
    }
  }
} else {
  logger.warn('[nutrivision] credentials/keystore.properties not found - release builds are signed with the DEBUG key. See scripts/make-keystore.sh.')
}
def nvArchitectures() {
  def value = findProperty('reactNativeArchitectures')
  return value ? value.split(',').collect { it.trim() } : ['armeabi-v7a', 'arm64-v8a', 'x86', 'x86_64']
}
android {
  splits {
    abi {
      enable true
      reset()
      include(*nvArchitectures())
      universalApk false
    }
  }
}
`;
    }
    return cfg;
  });
}

module.exports = withReleaseSigning;
