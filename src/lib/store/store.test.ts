/**
 * Comprehensive tests for the CompoMate Zustand store.
 *
 * Tests all slices: Files, Backdrop, Composition, Names, Export, UI.
 * Each describe block covers one slice, plus a cross-slice integration section.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { Asset } from '@/types/files';
import type { BackdropAsset } from '@/types/backdrop';
import type { BatchItem } from '@/types/export';
import type { CompositionState } from '@/lib/shared/composition';
import { INITIAL_COMPOSITION } from '@/lib/shared/composition';
import {
  BLEND_PRESETS,
  CANVAS_MIN_ZOOM,
  CANVAS_MAX_ZOOM,
  DEFAULT_JOB_NAME,
  NAME_OVERLAY_DEFAULTS,
  BACKDROP_DEFAULT_PROMPT,
  EXPORT_TOAST_DURATION_MS,
} from '@/lib/constants';

// ---------------------------------------------------------------------------
// Environment polyfills — must run before the store is imported
// ---------------------------------------------------------------------------

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
    get length() {
      return Object.keys(store).length;
    },
    key: (index: number) => Object.keys(store)[index] ?? null,
  };
})();

Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, writable: true });
if (typeof globalThis.window === 'undefined') {
  Object.defineProperty(globalThis, 'window', {
    value: { localStorage: localStorageMock },
    writable: true,
  });
} else {
  Object.defineProperty(globalThis.window, 'localStorage', {
    value: localStorageMock,
    writable: true,
  });
}

// File constructor polyfill for Node
if (typeof globalThis.File === 'undefined') {
  // @ts-expect-error minimal File shim for tests
  globalThis.File = class File {
    name: string;
    constructor(_bits: unknown[], name: string) {
      this.name = name;
    }
  };
}

// ---------------------------------------------------------------------------
// Import store AFTER polyfills
// ---------------------------------------------------------------------------

import { useStore } from './index';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function makeAsset(id: string, name = 'test.png'): Asset {
  return {
    id,
    name,
    file: new File([], name),
    objectUrl: `blob:http://localhost/${id}`,
    width: 2000,
    height: 3000,
  };
}

function makeBackdropAsset(id: string, name = 'bg.jpg'): BackdropAsset {
  return {
    id,
    name,
    objectUrl: `blob:http://localhost/${id}`,
    width: 4000,
    height: 5000,
    source: 'upload',
    createdAt: Date.now(),
  };
}

function makeBatchItem(id: string, overrides: Partial<BatchItem> = {}): BatchItem {
  return {
    id,
    label: `Item ${id}`,
    backdropId: 'bg-1',
    subjectId: 'sub-1',
    firstName: 'John',
    lastName: 'Doe',
    composition: { ...INITIAL_COMPOSITION },
    exportProfile: 'original',
    nameStyle: 'classic',
    fontPairId: 'classic',
    status: 'pending',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Reset store to initial state before each test
// ---------------------------------------------------------------------------

function resetStore() {
  localStorageMock.clear();
  // Use merge mode (no `true` flag) to reset data fields while preserving action functions
  useStore.setState({
    // FilesSlice
    subjects: [],
    activeSubjectId: null,
    // BackdropSlice
    backdrops: [],
    activeBackdropId: null,
    generation: { status: 'idle', prompt: BACKDROP_DEFAULT_PROMPT, model: 'flux' },
    // CompositionSlice
    composition: { ...INITIAL_COMPOSITION },
    exportProfileId: 'original',
    nameStyleId: 'classic',
    fontPairId: 'classic',
    lockSettings: false,
    // NamesSlice
    firstName: '',
    lastName: '',
    stickyLastName: false,
    nameOverlayEnabled: NAME_OVERLAY_DEFAULTS.enabled,
    nameSizePct: NAME_OVERLAY_DEFAULTS.sizePct,
    nameYFromBottomPct: NAME_OVERLAY_DEFAULTS.yFromBottomPct,
    // ExportSlice
    jobName: DEFAULT_JOB_NAME,
    batchItems: [],
    exportCounter: 0,
    approvalGiven: false,
    // UISlice
    leftTab: 'files',
    showShortcuts: false,
    showSideBySide: false,
    showDangerZone: false,
    showSafeArea: true,
    canvasZoom: 1,
    toastMessage: null,
  });
}

// =====================================================================
// TESTS
// =====================================================================

describe('FilesSlice', () => {
  beforeEach(resetStore);

  it('addSubjects — adds to subjects array and auto-selects first', () => {
    const a1 = makeAsset('s1');
    useStore.getState().addSubjects([a1]);
    const state = useStore.getState();
    expect(state.subjects).toHaveLength(1);
    expect(state.subjects[0].id).toBe('s1');
    expect(state.activeSubjectId).toBe('s1');
  });

  it('addSubjects — appending does not change active', () => {
    useStore.getState().addSubjects([makeAsset('s1')]);
    useStore.getState().addSubjects([makeAsset('s2'), makeAsset('s3')]);
    const state = useStore.getState();
    expect(state.subjects).toHaveLength(3);
    expect(state.activeSubjectId).toBe('s1'); // unchanged
  });

  it('removeSubject — removes from array', () => {
    useStore.getState().addSubjects([makeAsset('s1'), makeAsset('s2')]);
    useStore.getState().removeSubject('s1');
    const state = useStore.getState();
    expect(state.subjects).toHaveLength(1);
    expect(state.subjects[0].id).toBe('s2');
  });

  it('removeSubject — on active subject, activeSubjectId updates to next or null', () => {
    useStore.getState().addSubjects([makeAsset('s1'), makeAsset('s2'), makeAsset('s3')]);
    useStore.getState().setActiveSubject('s2');
    useStore.getState().removeSubject('s2');
    // After removing idx=1, should try subjects[1] (s3) first
    expect(useStore.getState().activeSubjectId).toBe('s3');
  });

  it('removeSubject — on last active, falls back to previous or null', () => {
    useStore.getState().addSubjects([makeAsset('s1'), makeAsset('s2')]);
    useStore.getState().setActiveSubject('s2');
    useStore.getState().removeSubject('s2');
    // idx was 1, subjects[1] doesn't exist, falls to subjects[0]
    expect(useStore.getState().activeSubjectId).toBe('s1');
  });

  it('removeSubject — removing sole subject sets activeSubjectId to null', () => {
    useStore.getState().addSubjects([makeAsset('s1')]);
    useStore.getState().removeSubject('s1');
    expect(useStore.getState().activeSubjectId).toBeNull();
    expect(useStore.getState().subjects).toHaveLength(0);
  });

  it('setActiveSubject — changes activeSubjectId', () => {
    useStore.getState().addSubjects([makeAsset('s1'), makeAsset('s2')]);
    useStore.getState().setActiveSubject('s2');
    expect(useStore.getState().activeSubjectId).toBe('s2');
  });

  it('nextSubject — cycles forward', () => {
    useStore.getState().addSubjects([makeAsset('s1'), makeAsset('s2'), makeAsset('s3')]);
    expect(useStore.getState().activeSubjectId).toBe('s1');
    useStore.getState().nextSubject();
    expect(useStore.getState().activeSubjectId).toBe('s2');
    useStore.getState().nextSubject();
    expect(useStore.getState().activeSubjectId).toBe('s3');
  });

  it('nextSubject — wraps around at end', () => {
    useStore.getState().addSubjects([makeAsset('s1'), makeAsset('s2')]);
    useStore.getState().setActiveSubject('s2');
    useStore.getState().nextSubject();
    expect(useStore.getState().activeSubjectId).toBe('s1');
  });

  it('prevSubject — cycles backward', () => {
    useStore.getState().addSubjects([makeAsset('s1'), makeAsset('s2'), makeAsset('s3')]);
    useStore.getState().setActiveSubject('s3');
    useStore.getState().prevSubject();
    expect(useStore.getState().activeSubjectId).toBe('s2');
    useStore.getState().prevSubject();
    expect(useStore.getState().activeSubjectId).toBe('s1');
  });

  it('prevSubject — wraps around at start', () => {
    useStore.getState().addSubjects([makeAsset('s1'), makeAsset('s2')]);
    useStore.getState().setActiveSubject('s1');
    useStore.getState().prevSubject();
    expect(useStore.getState().activeSubjectId).toBe('s2');
  });

  it('nextSubject — stale activeSubjectId snaps to first', () => {
    useStore.getState().addSubjects([makeAsset('s1'), makeAsset('s2')]);
    // Force a stale id
    useStore.setState({ activeSubjectId: 'nonexistent' });
    useStore.getState().nextSubject();
    expect(useStore.getState().activeSubjectId).toBe('s1');
  });

  it('prevSubject — stale activeSubjectId snaps to last', () => {
    useStore.getState().addSubjects([makeAsset('s1'), makeAsset('s2')]);
    useStore.setState({ activeSubjectId: 'nonexistent' });
    useStore.getState().prevSubject();
    expect(useStore.getState().activeSubjectId).toBe('s2');
  });

  it('replaceSubjects — replaces all and sets active to first', () => {
    useStore.getState().addSubjects([makeAsset('s1'), makeAsset('s2')]);
    useStore.getState().replaceSubjects([makeAsset('r1'), makeAsset('r2'), makeAsset('r3')]);
    const state = useStore.getState();
    expect(state.subjects).toHaveLength(3);
    expect(state.subjects[0].id).toBe('r1');
    expect(state.activeSubjectId).toBe('r1');
  });

  it('replaceSubjects with empty array — sets active to null', () => {
    useStore.getState().addSubjects([makeAsset('s1')]);
    useStore.getState().replaceSubjects([]);
    const state = useStore.getState();
    expect(state.subjects).toHaveLength(0);
    expect(state.activeSubjectId).toBeNull();
  });
});

// =====================================================================

describe('BackdropSlice', () => {
  beforeEach(resetStore);

  it('addBackdrop — adds to array and auto-selects', () => {
    const bg = makeBackdropAsset('bg-1');
    useStore.getState().addBackdrop(bg);
    const state = useStore.getState();
    expect(state.backdrops).toHaveLength(1);
    expect(state.backdrops[0].id).toBe('bg-1');
    expect(state.activeBackdropId).toBe('bg-1');
  });

  it('addBackdrop — second add does not change active', () => {
    useStore.getState().addBackdrop(makeBackdropAsset('bg-1'));
    useStore.getState().addBackdrop(makeBackdropAsset('bg-2'));
    expect(useStore.getState().activeBackdropId).toBe('bg-1');
    expect(useStore.getState().backdrops).toHaveLength(2);
  });

  it('removeBackdrop — removes from array', () => {
    useStore.getState().addBackdrop(makeBackdropAsset('bg-1'));
    useStore.getState().addBackdrop(makeBackdropAsset('bg-2'));
    useStore.getState().removeBackdrop('bg-1');
    const state = useStore.getState();
    expect(state.backdrops).toHaveLength(1);
    expect(state.backdrops[0].id).toBe('bg-2');
  });

  it('removeBackdrop — active resets when removed', () => {
    useStore.getState().addBackdrop(makeBackdropAsset('bg-1'));
    useStore.getState().removeBackdrop('bg-1');
    expect(useStore.getState().activeBackdropId).toBeNull();
  });

  it('setActiveBackdrop — changes active', () => {
    useStore.getState().addBackdrop(makeBackdropAsset('bg-1'));
    useStore.getState().addBackdrop(makeBackdropAsset('bg-2'));
    useStore.getState().setActiveBackdrop('bg-2');
    expect(useStore.getState().activeBackdropId).toBe('bg-2');
  });

  it('setActiveBackdrop(null) — clears active', () => {
    useStore.getState().addBackdrop(makeBackdropAsset('bg-1'));
    useStore.getState().setActiveBackdrop(null);
    expect(useStore.getState().activeBackdropId).toBeNull();
  });

  it('setGeneration — updates generation state partially', () => {
    useStore.getState().setGeneration({ status: 'generating', prompt: 'a test prompt' });
    const gen = useStore.getState().generation;
    expect(gen.status).toBe('generating');
    expect(gen.prompt).toBe('a test prompt');
    expect(gen.model).toBe('flux'); // unchanged
  });

  it('resetGeneration — resets to idle defaults', () => {
    useStore.getState().setGeneration({ status: 'error', error: 'fail' });
    useStore.getState().resetGeneration();
    const gen = useStore.getState().generation;
    expect(gen.status).toBe('idle');
    expect(gen.prompt).toBe(BACKDROP_DEFAULT_PROMPT);
    expect(gen.model).toBe('flux');
    expect(gen.error).toBeUndefined();
  });
});

// =====================================================================

describe('CompositionSlice', () => {
  beforeEach(resetStore);

  it('updateComposition — merges partial update', () => {
    useStore.getState().updateComposition({ xPct: 60 });
    expect(useStore.getState().composition.xPct).toBe(60);
  });

  it('updateComposition — preserves other fields', () => {
    useStore.getState().updateComposition({ xPct: 60 });
    const comp = useStore.getState().composition;
    expect(comp.yPct).toBe(INITIAL_COMPOSITION.yPct);
    expect(comp.subjectHeightPct).toBe(INITIAL_COMPOSITION.subjectHeightPct);
    expect(comp.reflectionEnabled).toBe(INITIAL_COMPOSITION.reflectionEnabled);
    expect(comp.shadowEnabled).toBe(INITIAL_COMPOSITION.shadowEnabled);
  });

  it('setExportProfile — changes exportProfileId', () => {
    useStore.getState().setExportProfile('8x10');
    expect(useStore.getState().exportProfileId).toBe('8x10');
  });

  it('setNameStyle — changes nameStyleId', () => {
    useStore.getState().setNameStyle('modern');
    expect(useStore.getState().nameStyleId).toBe('modern');
  });

  it('setFontPair — changes fontPairId', () => {
    useStore.getState().setFontPair('modern');
    expect(useStore.getState().fontPairId).toBe('modern');
  });

  it('setLockSettings — toggles lock', () => {
    expect(useStore.getState().lockSettings).toBe(false);
    useStore.getState().setLockSettings(true);
    expect(useStore.getState().lockSettings).toBe(true);
    useStore.getState().setLockSettings(false);
    expect(useStore.getState().lockSettings).toBe(false);
  });

  it('resetComposition — resets to INITIAL_COMPOSITION', () => {
    useStore.getState().updateComposition({ xPct: 99, yPct: 10, fogEnabled: true });
    useStore.getState().resetComposition();
    const comp = useStore.getState().composition;
    expect(comp.xPct).toBe(INITIAL_COMPOSITION.xPct);
    expect(comp.yPct).toBe(INITIAL_COMPOSITION.yPct);
    expect(comp.fogEnabled).toBe(INITIAL_COMPOSITION.fogEnabled);
  });

  it('applyBlendPreset("dramatic") — merges preset values into composition', () => {
    useStore.getState().applyBlendPreset('dramatic');
    const comp = useStore.getState().composition;
    const preset = BLEND_PRESETS.dramatic;
    expect(comp.reflectionEnabled).toBe(preset.reflectionEnabled);
    expect(comp.reflectionSizePct).toBe(preset.reflectionSizePct);
    expect(comp.reflectionOpacityPct).toBe(preset.reflectionOpacityPct);
    expect(comp.fogEnabled).toBe(preset.fogEnabled);
    expect(comp.fogOpacityPct).toBe(preset.fogOpacityPct);
    expect(comp.shadowStrengthPct).toBe(preset.shadowStrengthPct);
    expect(comp.shadowStretchPct).toBe(preset.shadowStretchPct);
    expect(comp.shadowBlurPx).toBe(preset.shadowBlurPx);
  });

  it('applyBlendPreset("soft") — merges soft preset', () => {
    useStore.getState().applyBlendPreset('soft');
    const comp = useStore.getState().composition;
    expect(comp.fogEnabled).toBe(true);
    expect(comp.fogOpacityPct).toBe(BLEND_PRESETS.soft.fogOpacityPct);
  });

  it('applyBlendPreset("studio") — omits fog values not in preset', () => {
    // First enable fog so we can verify studio doesn't touch fogOpacityPct
    useStore.getState().updateComposition({ fogEnabled: true, fogOpacityPct: 42 });
    useStore.getState().applyBlendPreset('studio');
    const comp = useStore.getState().composition;
    // Studio preset explicitly sets fogEnabled: false
    expect(comp.fogEnabled).toBe(false);
    // Studio preset has no fogOpacityPct key — should remain untouched
    expect(comp.fogOpacityPct).toBe(42);
  });

  it('applyBlendPreset preserves non-preset fields', () => {
    useStore.getState().updateComposition({ xPct: 70, yPct: 30 });
    useStore.getState().applyBlendPreset('dramatic');
    const comp = useStore.getState().composition;
    // xPct/yPct are not in any blend preset — should be preserved
    expect(comp.xPct).toBe(70);
    expect(comp.yPct).toBe(30);
  });
});

// =====================================================================

describe('NamesSlice', () => {
  beforeEach(resetStore);

  it('setFirstName — updates firstName', () => {
    useStore.getState().setFirstName('John');
    expect(useStore.getState().firstName).toBe('John');
  });

  it('setLastName — updates lastName', () => {
    useStore.getState().setLastName('Doe');
    expect(useStore.getState().lastName).toBe('Doe');
  });

  it('pasteAutoSplit("John Doe") — splits first/last', () => {
    useStore.getState().pasteAutoSplit('John Doe');
    expect(useStore.getState().firstName).toBe('John');
    expect(useStore.getState().lastName).toBe('Doe');
  });

  it('pasteAutoSplit("Madonna") — first name only, lastName unchanged', () => {
    useStore.getState().setLastName('PreExisting');
    useStore.getState().pasteAutoSplit('Madonna');
    expect(useStore.getState().firstName).toBe('Madonna');
    expect(useStore.getState().lastName).toBe('PreExisting');
  });

  it('pasteAutoSplit("Jean-Claude Van Damme") — first token as first, rest as last', () => {
    useStore.getState().pasteAutoSplit('Jean-Claude Van Damme');
    expect(useStore.getState().firstName).toBe('Jean-Claude');
    expect(useStore.getState().lastName).toBe('Van Damme');
  });

  it('pasteAutoSplit trims whitespace', () => {
    useStore.getState().pasteAutoSplit('  Alice   Wonderland  ');
    expect(useStore.getState().firstName).toBe('Alice');
    expect(useStore.getState().lastName).toBe('Wonderland');
  });

  it('stickyLastName=true → clearForNextFile clears firstName, keeps lastName', () => {
    useStore.getState().setFirstName('John');
    useStore.getState().setLastName('Smith');
    useStore.getState().setStickyLastName(true);
    useStore.getState().clearForNextFile();
    expect(useStore.getState().firstName).toBe('');
    expect(useStore.getState().lastName).toBe('Smith');
  });

  it('stickyLastName=false → clearForNextFile clears both', () => {
    useStore.getState().setFirstName('John');
    useStore.getState().setLastName('Smith');
    useStore.getState().setStickyLastName(false);
    useStore.getState().clearForNextFile();
    expect(useStore.getState().firstName).toBe('');
    expect(useStore.getState().lastName).toBe('');
  });

  it('setNameOverlayEnabled(false) — disables overlay', () => {
    expect(useStore.getState().nameOverlayEnabled).toBe(true); // default
    useStore.getState().setNameOverlayEnabled(false);
    expect(useStore.getState().nameOverlayEnabled).toBe(false);
  });

  it('setNameSizePct — updates size', () => {
    useStore.getState().setNameSizePct(5.0);
    expect(useStore.getState().nameSizePct).toBe(5.0);
  });

  it('setNameYFromBottomPct — updates position', () => {
    useStore.getState().setNameYFromBottomPct(8.0);
    expect(useStore.getState().nameYFromBottomPct).toBe(8.0);
  });
});

// =====================================================================

describe('ExportSlice', () => {
  beforeEach(resetStore);

  it('setJobName — updates jobName', () => {
    useStore.getState().setJobName('TestJob');
    expect(useStore.getState().jobName).toBe('TestJob');
  });

  it('addBatchItem — adds to batchItems array', () => {
    const item = makeBatchItem('b1');
    useStore.getState().addBatchItem(item);
    expect(useStore.getState().batchItems).toHaveLength(1);
    expect(useStore.getState().batchItems[0].id).toBe('b1');
  });

  it('addBatchItem — multiple items accumulate', () => {
    useStore.getState().addBatchItem(makeBatchItem('b1'));
    useStore.getState().addBatchItem(makeBatchItem('b2'));
    expect(useStore.getState().batchItems).toHaveLength(2);
  });

  it('updateBatchItem — updates specific item', () => {
    useStore.getState().addBatchItem(makeBatchItem('b1'));
    useStore.getState().updateBatchItem('b1', { status: 'done' });
    expect(useStore.getState().batchItems[0].status).toBe('done');
  });

  it('updateBatchItem — preserves other fields', () => {
    useStore.getState().addBatchItem(makeBatchItem('b1'));
    useStore.getState().updateBatchItem('b1', { status: 'done' });
    expect(useStore.getState().batchItems[0].firstName).toBe('John');
    expect(useStore.getState().batchItems[0].lastName).toBe('Doe');
  });

  it('removeBatchItem — removes item with status "pending"', () => {
    useStore.getState().addBatchItem(makeBatchItem('b1', { status: 'pending' }));
    useStore.getState().removeBatchItem('b1');
    expect(useStore.getState().batchItems).toHaveLength(0);
  });

  it('removeBatchItem — does NOT remove item with status "running"', () => {
    useStore.getState().addBatchItem(makeBatchItem('b1', { status: 'running' }));
    useStore.getState().removeBatchItem('b1');
    expect(useStore.getState().batchItems).toHaveLength(1);
    expect(useStore.getState().batchItems[0].status).toBe('running');
  });

  it('removeBatchItem — removes item with status "done"', () => {
    useStore.getState().addBatchItem(makeBatchItem('b1', { status: 'done' }));
    useStore.getState().removeBatchItem('b1');
    expect(useStore.getState().batchItems).toHaveLength(0);
  });

  it('removeBatchItem — removes item with status "failed"', () => {
    useStore.getState().addBatchItem(makeBatchItem('b1', { status: 'failed' }));
    useStore.getState().removeBatchItem('b1');
    expect(useStore.getState().batchItems).toHaveLength(0);
  });

  it('clearBatch — empties batchItems array', () => {
    useStore.getState().addBatchItem(makeBatchItem('b1'));
    useStore.getState().addBatchItem(makeBatchItem('b2'));
    useStore.getState().clearBatch();
    expect(useStore.getState().batchItems).toHaveLength(0);
  });

  it('incrementExportCounter — increments by 1', () => {
    expect(useStore.getState().exportCounter).toBe(0);
    useStore.getState().incrementExportCounter();
    expect(useStore.getState().exportCounter).toBe(1);
    useStore.getState().incrementExportCounter();
    expect(useStore.getState().exportCounter).toBe(2);
  });

  it('setApprovalGiven(true) — sets approvalGiven', () => {
    expect(useStore.getState().approvalGiven).toBe(false);
    useStore.getState().setApprovalGiven(true);
    expect(useStore.getState().approvalGiven).toBe(true);
  });
});

// =====================================================================

describe('UISlice', () => {
  beforeEach(resetStore);

  it('setLeftTab("backdrops") — changes leftTab', () => {
    expect(useStore.getState().leftTab).toBe('files');
    useStore.getState().setLeftTab('backdrops');
    expect(useStore.getState().leftTab).toBe('backdrops');
  });

  it('setShowShortcuts(true) — shows overlay', () => {
    useStore.getState().setShowShortcuts(true);
    expect(useStore.getState().showShortcuts).toBe(true);
  });

  it('setShowSideBySide(true) — enables compare mode', () => {
    useStore.getState().setShowSideBySide(true);
    expect(useStore.getState().showSideBySide).toBe(true);
  });

  it('setShowDangerZone(true) — shows crop guides', () => {
    useStore.getState().setShowDangerZone(true);
    expect(useStore.getState().showDangerZone).toBe(true);
  });

  it('setCanvasZoom(2.0) — sets zoom', () => {
    useStore.getState().setCanvasZoom(2.0);
    expect(useStore.getState().canvasZoom).toBe(2.0);
  });

  it('setCanvasZoom(10.0) — clamps to max', () => {
    useStore.getState().setCanvasZoom(10.0);
    expect(useStore.getState().canvasZoom).toBe(CANVAS_MAX_ZOOM); // 4.0
  });

  it('setCanvasZoom(0.01) — clamps to min', () => {
    useStore.getState().setCanvasZoom(0.01);
    expect(useStore.getState().canvasZoom).toBe(CANVAS_MIN_ZOOM); // 0.25
  });

  it('showToast("Hello") — sets toastMessage with unique id', () => {
    useStore.getState().showToast('Hello');
    const toast = useStore.getState().toastMessage;
    expect(toast).not.toBeNull();
    expect(toast!.message).toBe('Hello');
    expect(toast!.durationMs).toBe(EXPORT_TOAST_DURATION_MS);
    expect(typeof toast!.id).toBe('number');
  });

  it('showToast("msg", 3000, "error") — sets type to error', () => {
    useStore.getState().showToast('msg', 3000, 'error');
    const toast = useStore.getState().toastMessage;
    expect(toast!.type).toBe('error');
    expect(toast!.durationMs).toBe(3000);
  });

  it('two rapid showToast calls — produce different ids', () => {
    useStore.getState().showToast('first');
    const id1 = useStore.getState().toastMessage!.id;
    useStore.getState().showToast('second');
    const id2 = useStore.getState().toastMessage!.id;
    expect(id1).not.toBe(id2);
  });

  it('clearToast — sets toastMessage to null', () => {
    useStore.getState().showToast('Hello');
    expect(useStore.getState().toastMessage).not.toBeNull();
    useStore.getState().clearToast();
    expect(useStore.getState().toastMessage).toBeNull();
  });

  it('setShowSafeArea — toggles safe area overlay', () => {
    expect(useStore.getState().showSafeArea).toBe(true);
    useStore.getState().setShowSafeArea(false);
    expect(useStore.getState().showSafeArea).toBe(false);
  });
});

// =====================================================================

describe('Cross-slice integration', () => {
  beforeEach(resetStore);

  it('store exposes all slice state fields', () => {
    const state = useStore.getState();
    // FilesSlice
    expect(state).toHaveProperty('subjects');
    expect(state).toHaveProperty('activeSubjectId');
    // BackdropSlice
    expect(state).toHaveProperty('backdrops');
    expect(state).toHaveProperty('activeBackdropId');
    expect(state).toHaveProperty('generation');
    // CompositionSlice
    expect(state).toHaveProperty('composition');
    expect(state).toHaveProperty('exportProfileId');
    expect(state).toHaveProperty('nameStyleId');
    expect(state).toHaveProperty('fontPairId');
    expect(state).toHaveProperty('lockSettings');
    // NamesSlice
    expect(state).toHaveProperty('firstName');
    expect(state).toHaveProperty('lastName');
    expect(state).toHaveProperty('stickyLastName');
    expect(state).toHaveProperty('nameOverlayEnabled');
    expect(state).toHaveProperty('nameSizePct');
    expect(state).toHaveProperty('nameYFromBottomPct');
    // ExportSlice
    expect(state).toHaveProperty('jobName');
    expect(state).toHaveProperty('batchItems');
    expect(state).toHaveProperty('exportCounter');
    expect(state).toHaveProperty('approvalGiven');
    // UISlice
    expect(state).toHaveProperty('leftTab');
    expect(state).toHaveProperty('showShortcuts');
    expect(state).toHaveProperty('showSideBySide');
    expect(state).toHaveProperty('showDangerZone');
    expect(state).toHaveProperty('showSafeArea');
    expect(state).toHaveProperty('canvasZoom');
    expect(state).toHaveProperty('toastMessage');
  });

  it('store exposes all slice action functions', () => {
    const state = useStore.getState();
    // FilesSlice actions
    expect(typeof state.addSubjects).toBe('function');
    expect(typeof state.replaceSubjects).toBe('function');
    expect(typeof state.removeSubject).toBe('function');
    expect(typeof state.updateSubject).toBe('function');
    expect(typeof state.setActiveSubject).toBe('function');
    expect(typeof state.nextSubject).toBe('function');
    expect(typeof state.prevSubject).toBe('function');
    // BackdropSlice actions
    expect(typeof state.addBackdrop).toBe('function');
    expect(typeof state.replaceBackdrops).toBe('function');
    expect(typeof state.removeBackdrop).toBe('function');
    expect(typeof state.updateBackdrop).toBe('function');
    expect(typeof state.setActiveBackdrop).toBe('function');
    expect(typeof state.setGeneration).toBe('function');
    expect(typeof state.resetGeneration).toBe('function');
    // CompositionSlice actions
    expect(typeof state.updateComposition).toBe('function');
    expect(typeof state.setExportProfile).toBe('function');
    expect(typeof state.setNameStyle).toBe('function');
    expect(typeof state.setFontPair).toBe('function');
    expect(typeof state.setLockSettings).toBe('function');
    expect(typeof state.resetComposition).toBe('function');
    expect(typeof state.applyBlendPreset).toBe('function');
    // NamesSlice actions
    expect(typeof state.setFirstName).toBe('function');
    expect(typeof state.setLastName).toBe('function');
    expect(typeof state.setStickyLastName).toBe('function');
    expect(typeof state.setNameOverlayEnabled).toBe('function');
    expect(typeof state.setNameSizePct).toBe('function');
    expect(typeof state.setNameYFromBottomPct).toBe('function');
    expect(typeof state.pasteAutoSplit).toBe('function');
    expect(typeof state.clearForNextFile).toBe('function');
    // ExportSlice actions
    expect(typeof state.setJobName).toBe('function');
    expect(typeof state.addBatchItem).toBe('function');
    expect(typeof state.updateBatchItem).toBe('function');
    expect(typeof state.removeBatchItem).toBe('function');
    expect(typeof state.clearBatch).toBe('function');
    expect(typeof state.setApprovalGiven).toBe('function');
    expect(typeof state.incrementExportCounter).toBe('function');
    // UISlice actions
    expect(typeof state.setLeftTab).toBe('function');
    expect(typeof state.setShowShortcuts).toBe('function');
    expect(typeof state.setShowSideBySide).toBe('function');
    expect(typeof state.setShowDangerZone).toBe('function');
    expect(typeof state.setShowSafeArea).toBe('function');
    expect(typeof state.setCanvasZoom).toBe('function');
    expect(typeof state.showToast).toBe('function');
    expect(typeof state.clearToast).toBe('function');
  });

  it('initial state matches expected defaults', () => {
    const state = useStore.getState();
    // Files
    expect(state.subjects).toEqual([]);
    expect(state.activeSubjectId).toBeNull();
    // Backdrops
    expect(state.backdrops).toEqual([]);
    expect(state.activeBackdropId).toBeNull();
    expect(state.generation.status).toBe('idle');
    // Composition
    expect(state.composition).toEqual(INITIAL_COMPOSITION);
    expect(state.exportProfileId).toBe('original');
    expect(state.nameStyleId).toBe('classic');
    expect(state.fontPairId).toBe('classic');
    expect(state.lockSettings).toBe(false);
    // Names
    expect(state.firstName).toBe('');
    expect(state.lastName).toBe('');
    expect(state.stickyLastName).toBe(false);
    expect(state.nameOverlayEnabled).toBe(NAME_OVERLAY_DEFAULTS.enabled);
    expect(state.nameSizePct).toBe(NAME_OVERLAY_DEFAULTS.sizePct);
    expect(state.nameYFromBottomPct).toBe(NAME_OVERLAY_DEFAULTS.yFromBottomPct);
    // Export
    expect(state.jobName).toBe(DEFAULT_JOB_NAME);
    expect(state.batchItems).toEqual([]);
    expect(state.exportCounter).toBe(0);
    expect(state.approvalGiven).toBe(false);
    // UI
    expect(state.leftTab).toBe('files');
    expect(state.showShortcuts).toBe(false);
    expect(state.showSideBySide).toBe(false);
    expect(state.showDangerZone).toBe(false);
    expect(state.showSafeArea).toBe(true);
    expect(state.canvasZoom).toBe(1);
    expect(state.toastMessage).toBeNull();
  });

  it('actions from different slices do not interfere', () => {
    // Modify state across multiple slices
    useStore.getState().addSubjects([makeAsset('s1')]);
    useStore.getState().setFirstName('Alice');
    useStore.getState().setJobName('MyJob');
    useStore.getState().setLeftTab('backdrops');
    useStore.getState().updateComposition({ xPct: 75 });

    const state = useStore.getState();
    expect(state.subjects).toHaveLength(1);
    expect(state.firstName).toBe('Alice');
    expect(state.jobName).toBe('MyJob');
    expect(state.leftTab).toBe('backdrops');
    expect(state.composition.xPct).toBe(75);
    // Other defaults remain untouched
    expect(state.lastName).toBe('');
    expect(state.approvalGiven).toBe(false);
    expect(state.canvasZoom).toBe(1);
  });
});
