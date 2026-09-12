const { withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const os = require('os');
const path = require('path');

/**
 * Points Gradle at a CMake whose bundled ninja is long-path aware, by writing
 * `cmake.dir` into `android/local.properties` on every prebuild.
 *
 * This project sits 59 characters deep on disk, and the NDK builds of the
 * Nitro-based libraries (react-native-nitro-image, VisionCamera) generate
 * prefab paths under `.cxx/` that reach Windows' 260-character MAX_PATH. The
 * SDK's default CMake 3.22.1 ships ninja 1.10, which is not long-path aware
 * even with `LongPathsEnabled=1`; the symptom is ninja looping on
 * `Re-running CMake...` forever for `armeabi-v7a`. CMake 3.30+ ships ninja
 * 1.12 with the `longPathAware` manifest and builds cleanly from here.
 *
 * Setting `externalNativeBuild.cmake.version` from the root build.gradle is
 * not an option — AGP 9 has already locked the DSL by the time the root
 * project evaluates under Expo's autolinking — but AGP honours `cmake.dir`
 * from local.properties, which Expo regenerates without it. Hence this.
 *
 * Install one with `sdkmanager "cmake;3.31.6"`.
 */

const MIN_CMAKE = [3, 30, 0];

function sdkDir() {
  const fromEnv = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
  if (fromEnv && fs.existsSync(fromEnv)) return fromEnv;
  const guess = path.join(os.homedir(), 'AppData', 'Local', 'Android', 'Sdk');
  return fs.existsSync(guess) ? guess : null;
}

function parseVersion(name) {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(name);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

function newerOrEqual(a, b) {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] > b[i];
  }
  return true;
}

/** Highest installed CMake at or above MIN_CMAKE, or null. */
function findCmake(sdk) {
  const root = path.join(sdk, 'cmake');
  if (!fs.existsSync(root)) return null;
  const candidates = fs
    .readdirSync(root)
    .map((name) => ({ name, version: parseVersion(name) }))
    .filter((c) => c.version && newerOrEqual(c.version, MIN_CMAKE) && fs.existsSync(path.join(root, c.name, 'bin', 'ninja.exe')))
    .sort((a, b) => (newerOrEqual(a.version, b.version) ? -1 : 1));
  return candidates.length ? path.join(root, candidates[0].name) : null;
}

const toProps = (p) => p.replace(/\\/g, '/');

function withCmakeVersion(config) {
  return withDangerousMod(config, [
    'android',
    async (cfg) => {
      const sdk = sdkDir();
      if (!sdk) {
        console.warn('[nutrivision] ANDROID_HOME not set; leaving local.properties alone');
        return cfg;
      }
      const cmake = findCmake(sdk);
      if (!cmake) {
        console.warn(
          `[nutrivision] No CMake >= ${MIN_CMAKE.join('.')} under ${sdk}/cmake. ` +
            'Install one with `sdkmanager "cmake;3.31.6"` or the armeabi-v7a NDK build will loop on Windows.'
        );
      }
      const lines = [`sdk.dir=${toProps(sdk)}`];
      if (cmake) lines.push(`cmake.dir=${toProps(cmake)}`);
      fs.writeFileSync(path.join(cfg.modRequest.platformProjectRoot, 'local.properties'), lines.join('\n') + '\n');
      console.log(`[nutrivision] local.properties: sdk.dir=${sdk}${cmake ? `, cmake.dir=${cmake}` : ''}`);
      return cfg;
    },
  ]);
}

module.exports = withCmakeVersion;
