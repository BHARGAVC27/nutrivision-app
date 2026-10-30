import Constants from 'expo-constants';

/** In-app identity. One place to change it; the launcher name and icon live in app.json. */
export const brand = {
  name: 'NutriVision',
  /** The app icon (scripts/make-icons.py): a leaf that is also an eye, its iris in MUAC-tape colours. */
  logo: require('../../assets/images/icon.png'),
  tagline: 'Child nutrition screening',
  version: Constants.expoConfig?.version ?? '1.1.0',
} as const;
