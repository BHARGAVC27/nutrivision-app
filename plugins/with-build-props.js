const { withGradleProperties } = require('expo/config-plugins');
const fs = require('fs');
const os = require('os');
const path = require('path');

/**
 * Two things `android/gradle.properties` needs that Expo's template does not
 * write, applied on every prebuild (the file is generated, so editing it by
 * hand does not survive `expo prebuild --clean`):
 *
 * 1. `org.gradle.java.home` — a JDK the NDK build actually works with.
 *    Under JDK 24+ the prefab helper that AGP runs for every native library
 *    prints "WARNING: A restricted method in java.lang.System has been called"
 *    on stderr, and AGP treats any stderr from that helper as a failed
 *    configure step: every `configureCMake*[abi]` task for worklets,
 *    nitro-modules and screens fails with just that warning as the message.
 *    Passing `--enable-native-access` via JDK_JAVA_OPTIONS does not help —
 *    the JVM then prints "NOTE: Picked up JDK_JAVA_OPTIONS" to stderr instead.
 *    So the daemon must be a JDK 17–23. This finds one and pins it; without a
 *    pin Gradle uses whatever `java` is on PATH, which on this team's machines
 *    is JDK 25.
 *
 * 2. R8 + resource shrinking for release builds. Off, the release dex is
 *    52.8 MB uncompressed and 49 font files ship of which 8 are used.
 */

const JDK_MIN = 17;
const JDK_MAX = 23;

/** Major version from a JDK's `release` file, or null. */
function jdkMajor(home) {
  try {
    const rel = fs.readFileSync(path.join(home, 'release'), 'utf8');
    const m = /JAVA_VERSION="(\d+)/.exec(rel);
    return m ? Number(m[1]) : null;
  } catch {
    return null;
  }
}

function isUsableJdk(home) {
  if (!home || !fs.existsSync(path.join(home, 'bin', process.platform === 'win32' ? 'java.exe' : 'java'))) return false;
  const major = jdkMajor(home);
  return major != null && major >= JDK_MIN && major <= JDK_MAX;
}

function subdirs(root) {
  try {
    return fs
      .readdirSync(root, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => path.join(root, d.name));
  } catch {
    return [];
  }
}

/** First usable JDK, preferring an explicit choice over Gradle's own downloads over system installs. */
function findJdk() {
  const explicit = process.env.NUTRIVISION_JDK || process.env.JAVA_HOME;
  if (isUsableJdk(explicit)) return explicit;

  const candidates = [];
  // Gradle toolchain auto-provisioned JDKs: ~/.gradle/jdks/<vendor>-<ver>-.../ (the JDK may be one level down).
  for (const d of subdirs(path.join(os.homedir(), '.gradle', 'jdks'))) {
    candidates.push(d, ...subdirs(d));
  }
  if (process.platform === 'win32') {
    for (const root of ['C:\\Program Files\\Java', 'C:\\Program Files\\Eclipse Adoptium', 'C:\\Program Files\\Microsoft', 'C:\\Program Files\\Zulu', 'C:\\Program Files\\Amazon Corretto']) {
      candidates.push(...subdirs(root));
    }
    candidates.push('C:\\Program Files\\Android\\Android Studio\\jbr');
  } else {
    candidates.push(...subdirs('/usr/lib/jvm'), ...subdirs('/Library/Java/JavaVirtualMachines').map((d) => path.join(d, 'Contents', 'Home')));
  }
  return candidates.find(isUsableJdk) || null;
}

const toProps = (p) => p.replace(/\\/g, '/');

function setProperty(props, key, value) {
  const existing = props.find((p) => p.type === 'property' && p.key === key);
  if (existing) existing.value = value;
  else props.push({ type: 'property', key, value });
}

function withBuildProps(config) {
  return withGradleProperties(config, (cfg) => {
    const jdk = findJdk();
    if (jdk) {
      setProperty(cfg.modResults, 'org.gradle.java.home', toProps(jdk));
      console.log(`[nutrivision] gradle.properties: org.gradle.java.home=${jdk} (JDK ${jdkMajor(jdk)})`);
    } else {
      console.warn(
        `[nutrivision] No JDK ${JDK_MIN}-${JDK_MAX} found; not pinning org.gradle.java.home. ` +
          'Under JDK 24+ the NDK configure step fails — install JDK 17 or set NUTRIVISION_JDK.'
      );
    }
    setProperty(cfg.modResults, 'android.enableMinifyInReleaseBuilds', 'true');
    setProperty(cfg.modResults, 'android.enableShrinkResourcesInReleaseBuilds', 'true');
    return cfg;
  });
}

module.exports = withBuildProps;
