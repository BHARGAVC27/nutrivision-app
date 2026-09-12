const { withAppBuildGradle, withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Copies NutriVision's on-device model files into the native Android asset
 * directory on every `expo prebuild`.
 *
 * These are deliberately NOT JS/Metro assets: MediaPipe Tasks loads them
 * through the Android AssetManager from native code, so they have to live in
 * `android/app/src/main/assets/`. Doing the copy here (rather than dropping the
 * files into the generated `android/` tree by hand) means a clean prebuild
 * cannot silently lose them. See docs/ANDROID_APP_BRIEF.md §0.
 */

/** Files copied from `native-assets/` into the Android assets dir. */
const MODEL_FILES = [
  'pose_landmarker_lite.task', // Stage 1 live framing (preview feed)
  'pose_landmarker_full.task', // Stage 2 measurement (captured still)
  'selfie_segmenter.tflite', // Stage 2 person mask (the `mp-selfie` segmenter)
];

const NO_COMPRESS_MARKER = '// nutrivision: keep model files uncompressed';

/**
 * Model files must stay uncompressed inside the APK: MediaPipe maps them
 * straight out of the asset file descriptor, which a deflated entry cannot
 * provide.
 */
function withUncompressedModels(config) {
  return withAppBuildGradle(config, (cfg) => {
    if (!cfg.modResults.contents.includes(NO_COMPRESS_MARKER)) {
      cfg.modResults.contents += `
${NO_COMPRESS_MARKER}
android {
  androidResources {
    noCompress += ['task', 'tflite']
  }
}
`;
    }
    return cfg;
  });
}

function withNutriVisionAssets(config) {
  config = withUncompressedModels(config);
  return withDangerousMod(config, [
    'android',
    async (cfg) => {
      const { projectRoot, platformProjectRoot } = cfg.modRequest;
      const assetsDir = path.join(platformProjectRoot, 'app', 'src', 'main', 'assets');

      fs.mkdirSync(assetsDir, { recursive: true });

      for (const filename of MODEL_FILES) {
        const src = path.join(projectRoot, 'native-assets', filename);
        if (!fs.existsSync(src)) {
          throw new Error(
            `[nutrivision] Missing native asset "${filename}".\n` +
              `Run \`node scripts/fetch-models.mjs\` to download it, then prebuild again.`
          );
        }
        fs.copyFileSync(src, path.join(assetsDir, filename));
        console.log(`[nutrivision] bundled native asset: ${filename}`);
      }

      return cfg;
    },
  ]);
}

module.exports = withNutriVisionAssets;
