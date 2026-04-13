# CompoMate — Visual Specifications

**Last Updated:** 2026-04-13

---

## Brand / Theme

CompoMate is a professional tool for volume photography studios. The visual design is dark, minimal, and tool-focused — not consumer-facing. No SA Picture Day consumer branding; this is a studio operator UI.

---

## Component Library

**Primary:** shadcn/ui (Radix UI primitives + Tailwind CSS)
**Radix components in use:**
- `@radix-ui/react-dialog`
- `@radix-ui/react-dropdown-menu`
- `@radix-ui/react-label`
- `@radix-ui/react-separator`
- `@radix-ui/react-slider`
- `@radix-ui/react-switch`
- `@radix-ui/react-tabs`
- `@radix-ui/react-toast`
- `@radix-ui/react-tooltip`

**Additional:** `@base-ui/react` (newer Base UI components for unstyled primitives)

**Notifications:** Sonner (toast notifications)

**Icons:** Lucide React (`^0.577.0`)

---

## Custom CSS Classes

Defined in `src/app/globals.css`:

| Class | Purpose |
|-------|---------|
| `.panel` | Sidebar panel container (dark background, border) |
| `.btn-primary` | Primary action button |
| `.input` | Styled text input |

These custom classes complement shadcn components for the specific tool layout. <!-- TODO: verify exact color values in globals.css -->

---

## Layout

- **3-column layout:** FilePanel (left) | Canvas (center) | ControlPanel + ExportPanel (right)
- Canvas is the focal point — takes maximum remaining horizontal space
- Left and right sidebars are fixed-width panels with overflow scroll

---

## Canvas Rendering

The preview canvas uses react-konva (GPU-accelerated). Layer order (bottom to top):

1. Backdrop image
2. Shadow ellipse
3. Reflection (flipped subject, blurred)
4. Subject image (draggable, resizable via Transformer)
5. Fog gradient overlay
6. Name overlay (SVG rendered as Konva.Image)
7. DangerZoneOverlay (safe area boundaries)

**Note:** Preview is approximate. The Sharp server export is the authoritative render. Minor differences in color and blur are expected and accepted.

---

## Export Profiles

| Profile ID | Output Size | Use Case |
|-----------|------------|---------|
| `8x10` | 2400×3000 px (300 DPI) | Standard print |
| `5x7` | 1500×2100 px (300 DPI) | Standard print |
| `4x5` | 1200×1500 px (300 DPI) | Small print |
| `1x1` | 1500×1500 px (300 DPI) | Social / square |
| `original` | Backdrop native dimensions | Digital delivery |

DPI is always 300. ICC sRGB profile embedded. PNG output.

---

## Name Overlay Styles

Name overlays are generated server-side via Sharp's SVG pipeline using embedded TTF fonts. Font files stored in `public/fonts/` (build-time assets, not CDN-loaded).

Available name styles (IDs defined in `src/lib/shared/composition.ts`): <!-- TODO: list actual name_style_id values from composition.ts -->
- `classic` (default)
- Additional styles TBC

---

## Safe Area / Danger Zone

- **Safe area overlay:** Toggleable visual guide showing printable boundaries within the selected profile
- **Danger zone overlay:** Highlights regions where subject placement risks clipping at print. Shown as a patterned overlay on the Konva canvas.
- Safe area toggle in ExportPanel. DangerZone shown in the canvas layer stack.

---

## PostHog Session Recording

Session recording is enabled in production with `maskAllInputs: true`. This means text inputs (name fields, prompts) are visually masked in recordings. No visual changes to the actual UI — masking only affects the PostHog recording stream.
