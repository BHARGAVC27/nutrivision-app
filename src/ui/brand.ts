import Constants from 'expo-constants';

/** In-app identity, as drawn in the design. One place to change it. */
export const brand = {
  name: 'Baazu',
  /** The glyph in the green square beside the name. */
  mark: 'm',
  tagline: 'Arm screening aid',
  version: Constants.expoConfig?.version ?? '1.0.0',
} as const;
