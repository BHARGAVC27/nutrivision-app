import { File, Paths } from 'expo-file-system';
import * as Speech from 'expo-speech';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { BLANK, DEFAULT_LANG, EXTRA, STR, type Extra, type LangCode, type Strings } from '@/i18n/strings';
import type { Diet } from '@/nutrition/plan';
import type { ScreeningOutcome } from '@/pipeline/run';
import type { Sex } from '@/pipeline/zscore';
import { byNewest, loadRecords, newRecordId, persistPhoto, saveRecords, type ScreeningRecord } from '@/store/records';

/**
 * App-wide state: language and audio settings, the on-phone register, and
 * the screening currently in progress. One provider at the root; screens
 * read what they need through `useApp()`.
 */

/** The inputs gathered on the "Child's details" screen. */
export type Draft = {
  name: string;
  ageMonths: number;
  sex: Sex;
  /** Kept as the typed string so the keypad can edit it; parsed on use. */
  weight: string;
  /** Temporary file of the accepted still, until saved or discarded. */
  photoPath: string | null;
  /** Optional, only used by the food plan; null = not asked. */
  diet: Diet | null;
};

const DEFAULT_DRAFT: Draft = { name: '', ageMonths: 24, sex: 'F', weight: '', photoPath: null, diet: null };

type Settings = { lang: LangCode; audio: boolean };

type AppState = {
  lang: LangCode;
  setLang: (lang: LangCode) => void;
  audio: boolean;
  setAudio: (on: boolean) => void;
  /** Local-language strings. */
  L: Strings;
  /** The English second line — blank when English itself is selected. */
  E: Strings;
  /** Longer sentences and templated strings. */
  X: Extra;

  speaking: boolean;
  say: (text: string) => void;

  records: ScreeningRecord[];
  /** `photoPath` is the still's current (temporary) location; it is moved into permanent storage before the record is written. */
  addRecord: (r: Omit<ScreeningRecord, 'id' | 'createdAt' | 'photoPath'> & { photoPath: string | null }) => ScreeningRecord;
  deleteRecord: (id: string) => void;
  clearRecords: () => void;

  draft: Draft;
  updateDraft: (patch: Partial<Draft>) => void;
  resetDraft: () => void;

  /** Output of the last pipeline run for the current draft. */
  outcome: ScreeningOutcome | null;
  setOutcome: (o: ScreeningOutcome | null) => void;

  /** Set when a saved record is being viewed rather than a fresh result. */
  viewingId: string | null;
  setViewingId: (id: string | null) => void;

  cameraGranted: boolean;
  setCameraGranted: (v: boolean) => void;
};

const AppContext = createContext<AppState | null>(null);

const SETTINGS_NAME = 'settings.json';

function loadSettings(): Settings {
  try {
    const f = new File(Paths.document, SETTINGS_NAME);
    if (!f.exists) return { lang: DEFAULT_LANG, audio: true };
    const parsed = JSON.parse(f.textSync()) as Partial<Settings>;
    return {
      lang: parsed.lang && parsed.lang in STR ? parsed.lang : DEFAULT_LANG,
      audio: parsed.audio ?? true,
    };
  } catch {
    return { lang: DEFAULT_LANG, audio: true };
  }
}

function persistSettings(s: Settings) {
  try {
    new File(Paths.document, SETTINGS_NAME).write(JSON.stringify(s));
  } catch {
    // Settings that fail to persist still apply for this session.
  }
}

/** Removes a temporary still. The photo never outlives the screening it was taken for. */
export function discardPhoto(path: string | null | undefined) {
  if (!path) return;
  try {
    const f = new File(path.startsWith('file://') ? path : `file://${path}`);
    if (f.exists) f.delete();
  } catch {
    // Best effort; the cache directory is reclaimed by the OS anyway.
  }
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [records, setRecords] = useState<ScreeningRecord[]>(() => loadRecords().sort(byNewest));
  const [draft, setDraft] = useState<Draft>(DEFAULT_DRAFT);
  const [outcome, setOutcome] = useState<ScreeningOutcome | null>(null);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [cameraGranted, setCameraGranted] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const speakingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => persistSettings(settings), [settings]);

  const setLang = useCallback((lang: LangCode) => setSettings((s) => ({ ...s, lang })), []);
  const setAudio = useCallback((audio: boolean) => setSettings((s) => ({ ...s, audio })), []);

  const L = STR[settings.lang];
  const E = settings.lang === 'en' ? BLANK : STR.en;
  const X = EXTRA[settings.lang];

  const say = useCallback(
    (text: string) => {
      if (!settings.audio) return;
      const stop = () => {
        if (speakingTimer.current) clearTimeout(speakingTimer.current);
        setSpeaking(false);
      };
      setSpeaking(true);
      // The caption stays visible a little after the voice stops (or when the
      // device has no voice for this language at all), as in the design.
      if (speakingTimer.current) clearTimeout(speakingTimer.current);
      speakingTimer.current = setTimeout(stop, 4200);
      try {
        Speech.stop();
        Speech.speak(text, {
          language: L.code,
          rate: 0.9,
          onDone: stop,
          onError: stop,
        });
      } catch {
        // No TTS engine; the caption still shows.
      }
    },
    [settings.audio, L.code]
  );

  /**
   * Writes the register, never throwing out of a state updater: a failed write
   * (disk full) is logged and the in-memory list stays intact, so the next
   * successful save — which always writes the whole list — catches up.
   */
  const persist = (next: ScreeningRecord[]) => {
    try {
      saveRecords(next);
    } catch (e) {
      console.error('[records] save failed; records kept in memory', e);
    }
  };

  const addRecord = useCallback((r: Omit<ScreeningRecord, 'id' | 'createdAt' | 'photoPath'> & { photoPath: string | null }) => {
    const { photoPath: tempPhotoPath, ...rest } = r;
    const id = newRecordId();
    const photoPath = tempPhotoPath ? persistPhoto(tempPhotoPath, id) : null;
    const record: ScreeningRecord = { ...rest, id, createdAt: new Date().toISOString(), photoPath };
    setRecords((prev) => {
      const next = [record, ...prev];
      persist(next);
      return next;
    });
    return record;
  }, []);

  const deleteRecord = useCallback((id: string) => {
    setRecords((prev) => {
      discardPhoto(prev.find((r) => r.id === id)?.photoPath);
      const next = prev.filter((r) => r.id !== id);
      persist(next);
      return next;
    });
  }, []);

  const clearRecords = useCallback(() => {
    setRecords((prev) => {
      prev.forEach((r) => discardPhoto(r.photoPath));
      persist([]);
      return [];
    });
  }, []);

  const updateDraft = useCallback((patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch })), []);
  const resetDraft = useCallback(() => {
    setDraft((d) => {
      discardPhoto(d.photoPath);
      return DEFAULT_DRAFT;
    });
    setOutcome(null);
  }, []);

  const value = useMemo<AppState>(
    () => ({
      lang: settings.lang,
      setLang,
      audio: settings.audio,
      setAudio,
      L,
      E,
      X,
      speaking,
      say,
      records,
      addRecord,
      deleteRecord,
      clearRecords,
      draft,
      updateDraft,
      resetDraft,
      outcome,
      setOutcome,
      viewingId,
      setViewingId,
      cameraGranted,
      setCameraGranted,
    }),
    [settings, setLang, setAudio, L, E, X, speaking, say, records, addRecord, deleteRecord, clearRecords, draft, updateDraft, resetDraft, outcome, viewingId, cameraGranted]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppState {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside <AppProvider>');
  return ctx;
}
