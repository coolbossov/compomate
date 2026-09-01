export const BACKGROUND_ACTIVITIES = [
  'Headshots', 'Dance', 'Gymnastics', 'Cheer', 'Martial Arts', 'Basketball', 'Volleyball',
  'Soccer', 'Football', 'Baseball', 'Softball', 'Golf', 'Hockey', 'Swimming',
  'Wrestling', 'Lacrosse', 'Tennis', 'Track & Field', 'Cross Country', 'School',
  'Daycare', 'Family', 'Senior Portraits', 'Pro Bono',
] as const;

export type BackgroundActivity = (typeof BACKGROUND_ACTIVITIES)[number];
export type HeadshotEnvironment = 'office' | 'outside' | 'conference-room';
export type BackgroundStyleId = 'arena' | 'graphic' | 'smoke' | 'light' | 'texture' | 'motion' | 'school' | 'minimal';

export interface BackgroundStudioState {
  organizationName: string;
  organizationConfirmed: boolean;
  teamColors: string[];
  activity: BackgroundActivity;
  headshotEnvironment: HeadshotEnvironment;
  style: BackgroundStyleId;
  poseCount: 1 | 2 | 3;
  includeTeamName: boolean;
  includeLogo: boolean;
  logoDataUrl: string | null;
  useCustomDirection: boolean;
  customDirection: string;
  refinement: string;
}

export const DEFAULT_BACKGROUND_STUDIO_STATE: BackgroundStudioState = {
  organizationName: 'St. James Mustangs',
  organizationConfirmed: true,
  teamColors: ['#0d5c3d', '#ffffff', '#24262b'],
  activity: 'Volleyball',
  headshotEnvironment: 'office',
  style: 'arena',
  poseCount: 1,
  includeTeamName: true,
  includeLogo: false,
  logoDataUrl: null,
  useCustomDirection: false,
  customDirection: '',
  refinement: '',
};

const STYLE_DIRECTIONS: Record<BackgroundStyleId, string> = {
  arena: 'cinematic arena atmosphere, dramatic rim lighting, refined depth and restrained energy',
  graphic: 'bold editorial graphic shapes, clean hierarchy, strong negative space, premium sports branding feel',
  smoke: 'controlled studio haze, dimensional light beams, polished dark tonal transitions',
  light: 'bright high-key studio, soft architectural depth, clean premium finish',
  texture: 'subtle tactile wall and floor textures, realistic material detail, sophisticated lighting',
  motion: 'dynamic directional light and abstract energy trails, balanced and uncluttered',
  school: 'elevated school-spirit atmosphere using color and shape, not text or logos',
  minimal: 'modern minimal studio architecture, generous negative space, quiet luxury',
};

const ENVIRONMENT_DIRECTIONS: Record<HeadshotEnvironment, string> = {
  office: 'a contemporary professional office with soft window light and understated architectural depth',
  outside: 'an elegant outdoor professional setting with natural light, subtle greenery, and creamy depth',
  'conference-room': 'a modern executive conference room with glass, warm practical lights, and believable depth',
};

function subjectPlacement(count: 1 | 2 | 3): string {
  if (count === 1) return 'Reserve one clear full-height subject zone in the center.';
  if (count === 2) return 'Reserve two clear full-height subject zones at left-center and right-center.';
  return 'Reserve three clear full-height subject zones across the frame.';
}

export function buildBackgroundDirectionPrompt(state: BackgroundStudioState): string {
  const activityDirection = state.activity === 'Headshots'
    ? `${ENVIRONMENT_DIRECTIONS[state.headshotEnvironment]} suitable for a professional headshot composite`
    : `an elevated ${state.activity.toLowerCase()} portrait background plate`;
  const colors = state.teamColors.length > 0
    ? `Use this restrained color palette: ${state.teamColors.join(', ')}.`
    : '';
  const custom = state.useCustomDirection && state.customDirection.trim()
    ? `Additional art direction: ${state.customDirection.trim()}.`
    : '';
  const refinement = state.refinement.trim()
    ? `Refinement requested: ${state.refinement.trim()}.`
    : '';

  return [
    'Create a completely empty premium 4:5 vertical background plate for later subject compositing. Zero people or human figures may appear anywhere in the scene.',
    `Scene direction: ${activityDirection}.`,
    STYLE_DIRECTIONS[state.style] + '.',
    colors,
    subjectPlacement(state.poseCount),
    'Background plate only: no people, silhouettes, body parts, faces, player names, player numbers, words, letters, watermarks, emblems, or invented logos.',
    'Keep the subject zones visually quiet with believable floor contact, coherent perspective, and professional portrait lighting.',
    'Any exact team name or uploaded logo will be added later as a separate editable overlay.',
    custom,
    refinement,
  ].filter(Boolean).join(' ');
}

export function isBackgroundStudioState(value: unknown): value is BackgroundStudioState {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<BackgroundStudioState>;
  return typeof candidate.organizationName === 'string'
    && typeof candidate.organizationConfirmed === 'boolean'
    && Array.isArray(candidate.teamColors)
    && candidate.teamColors.every((color) => typeof color === 'string')
    && BACKGROUND_ACTIVITIES.includes(candidate.activity as BackgroundActivity)
    && ['office', 'outside', 'conference-room'].includes(String(candidate.headshotEnvironment))
    && Object.hasOwn(STYLE_DIRECTIONS, String(candidate.style))
    && [1, 2, 3].includes(Number(candidate.poseCount))
    && typeof candidate.includeTeamName === 'boolean'
    && typeof candidate.includeLogo === 'boolean'
    && (candidate.logoDataUrl === null || (typeof candidate.logoDataUrl === 'string' && candidate.logoDataUrl.startsWith('data:image/')))
    && typeof candidate.useCustomDirection === 'boolean'
    && typeof candidate.customDirection === 'string'
    && typeof candidate.refinement === 'string';
}
