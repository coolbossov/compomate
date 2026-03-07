// ============================================================
// CompoMate — Central Constants
// ============================================================

// --- Export Dimensions (ALWAYS 4000x5000, never upscale) ---
export const EXPORT_WIDTH_PX = 4000;
export const EXPORT_HEIGHT_PX = 5000;
export const EXPORT_ASPECT_RATIO = 4 / 5; // width/height
export const EXPORT_DPI = 300;
export const CANVAS_ASPECT_RATIO = 4 / 5;

// --- Crop Safety Zones (fraction of 4:5 canvas) ---
// These define crop zones for printing, NOT export dimensions
export const CROP_ZONES = {
  "4x6": { widthFrac: 0.833, heightFrac: 1.0 }, // 4:6 portrait inscribed in 4000×5000: width=5000*(4/6)=3333px → 3333/4000
  "5x7": { widthFrac: 0.893, heightFrac: 1.0 }, // 5:7 portrait inscribed in 4000×5000: width=5000*(5/7)=3571px → 3571/4000
} as const;

// --- File Limits ---
export const MAX_FILE_BYTES = 45 * 1024 * 1024; // 45MB per file
export const MAX_FILES_PER_IMPORT = 120;
export const MAX_INPUT_PIXELS = 100_000_000; // 100MP
export const MAX_INPUT_EDGE_PX = 12_000; // 12000px on longest edge

// --- R2 ---
export const R2_BUCKET = "compomate-uploads";
export const R2_PRESIGNED_EXPIRY_SECONDS = 3600; // 1 hour
export const R2_MAX_UPLOAD_BYTES = 500 * 1024 * 1024; // 500MB

// --- Backdrop Generation ---
export const BACKDROP_POLL_INTERVAL_MS = 2200;
export const BACKDROP_MAX_POLLS = 180; // ~6.6 minutes max
export const BACKDROP_DEFAULT_PROMPT =
  "A dramatic sports photography stage background with professional studio lighting, dark atmospheric background with subtle light rays, cinematic quality";
export const BACKDROP_DEFAULT_STYLE_HINT =
  "Studio dance portrait, clean floor reflections, cinematic haze";

// --- AI Models ---
export const FAL_FLUX_MODEL = "fal-ai/flux-pro/v1.1-ultra";
export const FAL_IDEOGRAM_MODEL = "fal-ai/ideogram/v2";
export const FAL_BACKDROP_ASPECT = "4:5";
export const FAL_BACKDROP_WIDTH = 1024;
export const FAL_BACKDROP_HEIGHT = 1280;

// --- Canvas / UI ---
export const CANVAS_MIN_ZOOM = 0.25;
export const CANVAS_MAX_ZOOM = 4.0;
export const CANVAS_ZOOM_STEP = 0.1;
export const NUDGE_PX = 1; // arrow key nudge (percentage points)
export const NUDGE_SHIFT_PX = 10; // shift+arrow nudge

// --- Subject drag clamp bounds (percentage) ---
export const DRAG_X_MIN = 5;
export const DRAG_X_MAX = 95;
export const DRAG_Y_MIN = 25;
export const DRAG_Y_MAX = 96;

// --- Slider bounds for all composition controls ---
export const SLIDER_BOUNDS = {
  xPct: { min: 5, max: 95, step: 1 },
  yPct: { min: 25, max: 96, step: 1 },
  subjectHeightPct: { min: 20, max: 95, step: 1 },
  shadowStrengthPct: { min: 0, max: 100, step: 1 },
  lightDirectionDeg: { min: 0, max: 359, step: 1 },
  lightElevationDeg: { min: 5, max: 85, step: 1 },
  shadowStretchPct: { min: 35, max: 250, step: 1 },
  shadowBlurPx: { min: 0, max: 40, step: 1 },
  reflectionSizePct: { min: 0, max: 200, step: 1 },
  reflectionPositionPct: { min: 70, max: 130, step: 1 },
  reflectionOpacityPct: { min: 0, max: 90, step: 1 },
  reflectionBlurPx: { min: 0, max: 20, step: 1 },
  legFadeStartPct: { min: 45, max: 95, step: 1 },
  fogOpacityPct: { min: 5, max: 95, step: 1 },
  fogHeightPct: { min: 8, max: 60, step: 1 },
} as const;

// --- Reflection ---
export const REFLECTION_BLUR_LAYERS = 5; // progressive blur layers
export const REFLECTION_MAX_BLUR_PX = 32; // max blur at bottom of reflection
/** Alpha mask applied to the reflected image (strong at top, fades out) */
export const REFLECTION_MASK_START_ALPHA = 0.75; // rgba(0,0,0,0.75) at top

// --- Light Wrap ---
export const LIGHT_WRAP_RADIUS_PX = 8; // sample radius from subject edge
export const LIGHT_WRAP_STRENGTH = 0.35; // blend opacity

// --- MediaPipe ---
export const MEDIAPIPE_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";
export const MEDIAPIPE_CONFIDENCE_THRESHOLD = 0.5;
export const MEDIAPIPE_RUNNING_MODE = "IMAGE";

// --- Export ---
export const EXPORT_TOAST_DURATION_MS = 4000;
export const EXPORT_RATE_LIMIT_PER_MINUTE = 30;

// --- Export payload budget (bytes sent to cloud render API) ---
export const EXPORT_PAYLOAD_TARGET_BYTES = 3_700_000; // soft budget — try to compress below
export const EXPORT_PAYLOAD_MAX_BYTES = 4_200_000; // hard ceiling — reject above this
export const EXPORT_PAYLOAD_MAX_RETRIES = 5; // compression retry attempts

// --- Export payload sizing (relative to profile long side) ---
export const EXPORT_BACKDROP_LONG_FACTOR = 1.55; // initial backdrop downscale target
export const EXPORT_SUBJECT_LONG_FACTOR = 1.25; // initial subject downscale target
export const EXPORT_PROFILE_FALLBACK_LONG_PX = 3200; // used when profile has no explicit px
export const EXPORT_BACKDROP_QUALITY_INIT = 0.9; // initial JPEG quality for backdrop
export const EXPORT_SUBJECT_QUALITY_INIT = 0.92; // initial WebP quality for subject
export const EXPORT_BACKDROP_QUALITY_STEP = 0.06; // quality reduction per retry
export const EXPORT_SUBJECT_QUALITY_STEP = 0.07; // quality reduction per retry
export const EXPORT_BACKDROP_QUALITY_MIN = 0.64; // minimum allowed backdrop quality
export const EXPORT_SUBJECT_QUALITY_MIN = 0.68; // minimum allowed subject quality
export const EXPORT_BACKDROP_LONG_MIN_PX = 1400; // floor on backdrop long side during retry
export const EXPORT_SUBJECT_LONG_MIN_PX = 1100; // floor on subject long side during retry
export const EXPORT_BACKDROP_LONG_SHRINK = 0.87; // multiplier applied each retry
export const EXPORT_SUBJECT_LONG_SHRINK = 0.9; // multiplier applied each retry

// --- File Naming ---
// Pattern: [JobName]-[FirstName]-[LastName]-[0001].png
export const DEFAULT_JOB_NAME = "Job";
export const DEFAULT_PROJECT_NAME = "Session";
export function buildExportFilename(
  jobName: string,
  firstName: string,
  lastName: string,
  index: number,
): string {
  const job = jobName.trim().replace(/\s+/g, "-") || DEFAULT_JOB_NAME;
  const first = firstName.trim().replace(/\s+/g, "-") || "Unknown";
  const last = lastName.trim().replace(/\s+/g, "-") || "Unknown";
  const seq = String(index).padStart(4, "0");
  return `${job}-${first}-${last}-${seq}.png`;
}

// --- Fonts ---
export const FONT_PAIRS = [
  {
    id: "classic",
    label: "Classic (Script + Condensed)",
    firstNameFont: "GreatVibes-Regular.ttf",
    lastNameFont: "Oswald-Bold.ttf",
  },
  {
    id: "modern",
    label: "Modern (Flowing + Clean)",
    firstNameFont: "DancingScript-Regular.ttf",
    lastNameFont: "Montserrat-Bold.ttf",
  },
] as const;

export type FontPairId = "classic" | "modern";
export const DEFAULT_FONT_PAIR: FontPairId = "classic";

// --- Session Storage Keys ---
export const SESSION_STORAGE_KEY = "compomate-session";
export const SESSION_RESUME_STORAGE_KEY = "compomate-session-resume";
export const TEMPLATES_STORAGE_KEY = "compomate-templates";

// --- Supabase Tables ---
export const DB_TABLES = {
  SESSIONS: "compomate_sessions",
  TEMPLATES: "compomate_templates",
  BACKDROPS: "compomate_backdrops",
  USAGE_LOGS: "compomate_usage_logs",
  PROJECTS: "compomate_projects", // legacy
} as const;

// --- Color Palette (CSS var references for use in Konva / canvas) ---
export const COLORS = {
  bg: "#0D0D12",
  panel: "#13131A",
  card: "#1A1A24",
  primary: "#6367FF",
  secondary: "#8494FF",
  label: "#C9BEFF",
  accent: "#FFDBFD",
  danger: "#FF4444",
  success: "#44FF88",
  border: "#2A2A38",
  /** Fog tint color (cool off-white haze applied to floor) */
  fogTint: "rgba(234, 238, 255, {opacity})", // substitute {opacity} at use-site
} as const;

// --- Shadow gradient stops (used in canvas shadow ellipse rendering) ---
export const SHADOW_GRADIENT_CENTER_ALPHA = 0.72; // rgba(0,0,0,0.72) at center
export const SHADOW_GRADIENT_MID_ALPHA = 0.48; // rgba(0,0,0,0.48) at 48%
export const SHADOW_GRADIENT_MID_STOP = 0.48; // 48% stop position

// --- Fog rendering ---
export const FOG_BLUR_PX = 8; // CSS blur applied to floor fog div

// --- UI Layout ---
export const LAYOUT = {
  leftPanelWidth: 320,
  rightPanelWidth: 360,
  headerHeight: 56, // h-14 = 56px
} as const;

// --- Name Overlay Defaults ---
export const NAME_OVERLAY_DEFAULTS = {
  enabled: true,
  sizePct: 8, // relative to canvas height
  yFromBottomPct: 5,
} as const;

// --- Pose Analysis (subject pixel scan) ---
export const POSE_STANCE_SCAN_START_FRAC = 0.72; // start scanning for stance width at 72% height
export const POSE_TOP_END_FRAC = 0.3; // top 30% used for lean detection
export const POSE_BOTTOM_START_FRAC = 0.65; // bottom section start for lean detection
export const POSE_ALPHA_THRESHOLD = 18; // pixels with alpha < 18 are treated as transparent
export const POSE_DEFAULT_STANCE_WIDTH_PCT = 34;
export const POSE_DEFAULT_LEAN_PCT = 0;
export const POSE_DEFAULT_SUBJECT_ASPECT = 0.52;
export const POSE_LEAN_CLAMP_MIN = -25;
export const POSE_LEAN_CLAMP_MAX = 25;

// --- Auto-Placement defaults ---
export const AUTO_PLACE_Y_SNAP_PCT = 85; // baseline Y when auto-placing
export const AUTO_PLACE_HEIGHT_BASE = 62; // base subject height % for auto suggest
export const AUTO_PLACE_HEIGHT_ASPECT_SCALE = 26; // multiplied by (0.52 - aspect) to adjust height
export const AUTO_PLACE_HEIGHT_MIN = 48;
export const AUTO_PLACE_HEIGHT_MAX = 82;
export const AUTO_PLACE_LEAN_CORRECTION = 0.22; // xPct offset: 50 - leanPct * 0.22
export const AUTO_PLACE_SHADOW_STRENGTH_BASE = 36; // 36 + stanceWidthPct * 0.25
export const AUTO_PLACE_SHADOW_STRENGTH_STANCE_SCALE = 0.25;
export const AUTO_PLACE_SHADOW_STRENGTH_MIN = 20;
export const AUTO_PLACE_SHADOW_STRENGTH_MAX = 76;
export const AUTO_PLACE_SHADOW_STRETCH_BASE = 88; // 88 + stanceWidthPct * 0.45
export const AUTO_PLACE_SHADOW_STRETCH_STANCE_SCALE = 0.45;
export const AUTO_PLACE_SHADOW_STRETCH_MIN = 65;
export const AUTO_PLACE_SHADOW_STRETCH_MAX = 170;

// --- Light Direction Detection (backdrop brightness scan) ---
export const LIGHT_DETECT_SAMPLE_SIZE = 140; // px — downscale backdrop to 140×140 for scan
export const LIGHT_DETECT_SEARCH_BOTTOM_FRAC = 0.7; // only scan top 70% of sample for brightest pixel
export const LIGHT_DETECT_DEFAULT_DEG = 35; // fallback direction when canvas unavailable
export const LIGHT_DETECT_DEFAULT_SEARCH_X_FRAC = 0.2; // fallback brightX
export const LIGHT_DETECT_DEFAULT_SEARCH_Y_FRAC = 0.2; // fallback brightY
// BT.709 luminance coefficients
export const LUMA_R = 0.2126;
export const LUMA_G = 0.7152;
export const LUMA_B = 0.0722;

// --- Auto Light Elevation (from auto shadow direction) ---
export const AUTO_LIGHT_ELEVATION_BASE = 38; // 38 + (stanceWidthPct - 34) * 0.2
export const AUTO_LIGHT_ELEVATION_STANCE_SCALE = 0.2;
export const AUTO_LIGHT_ELEVATION_MIN = 20;
export const AUTO_LIGHT_ELEVATION_MAX = 62;

// --- Blend Presets ---
export const BLEND_PRESETS = {
  soft: {
    reflectionEnabled: true,
    reflectionSizePct: 88,
    reflectionOpacityPct: 26,
    reflectionBlurPx: 3,
    fogEnabled: true,
    fogOpacityPct: 18,
    fogHeightPct: 24,
    shadowEnabled: true,
    shadowStrengthPct: 28,
    shadowStretchPct: 90,
    shadowBlurPx: 14,
  },
  studio: {
    reflectionEnabled: true,
    reflectionSizePct: 100,
    reflectionOpacityPct: 36,
    reflectionBlurPx: 2,
    fogEnabled: false,
    shadowEnabled: true,
    shadowStrengthPct: 44,
    shadowStretchPct: 100,
    shadowBlurPx: 12,
  },
  dramatic: {
    reflectionEnabled: true,
    reflectionSizePct: 116,
    reflectionOpacityPct: 44,
    reflectionBlurPx: 5,
    fogEnabled: true,
    fogOpacityPct: 34,
    fogHeightPct: 31,
    shadowEnabled: true,
    shadowStrengthPct: 56,
    shadowStretchPct: 132,
    shadowBlurPx: 16,
  },
} as const;

// --- Shadow physics computation clamps (from estimateShadowPreviewMetrics) ---
export const SHADOW_ELEVATION_MIN_DEG = 5;
export const SHADOW_ELEVATION_MAX_DEG = 85;
export const SHADOW_STRETCH_MIN = 0.35;
export const SHADOW_STRETCH_MAX = 2.5;
export const SHADOW_BLUR_MAX_PX = 40;
export const SHADOW_STANCE_WIDTH_MIN_FRAC = 0.12;
export const SHADOW_STANCE_WIDTH_MAX_FRAC = 0.8;

// --- Batch label slug truncation ---
export const BATCH_LABEL_MAX_CHARS = 64;

// --- Project snapshot version ---
export const PROJECT_SNAPSHOT_VERSION = 2;
