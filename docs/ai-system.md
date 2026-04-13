# CompoMate — AI System

**Last Updated:** 2026-04-13

CompoMate uses two AI providers for backdrop generation. Neither is used for compositing (that is Sharp server-side). There is no Claude/Anthropic SDK in this codebase.

---

## fal.ai — Flux Schnell (Backdrop Generation)

**Purpose:** Text-to-image generation for studio backdrop images. User enters a prompt + style + aspect ratio and receives a generated PNG backdrop.

**Provider:** fal.ai
**Model:** Flux Schnell (fast diffusion model optimized for low-latency generation)
**API Key:** `FAL_KEY`

**Flow:**
```
User: enters prompt + style + aspect ratio
  → POST /api/generate
    → fal.ai Flux Schnell API call
    → result image URL returned
    → server downloads image, uploads to R2
    → R2 object key returned to client
  → backdrop added to FilePanel asset list
```

**Prompt architecture:**
- User provides free-text prompt (e.g., "dark blue sparkle studio backdrop")
- Style modifier appended (e.g., "professional, studio lighting, clean")
- Aspect ratio passed as image size parameter (portrait for 8x10, square for 1x1, etc.)
- No system prompt or complex chaining — single generation call per request

**Failure behavior:** Generation failure returns error to client. User can retry or upload a backdrop manually. Failure does not affect compositing.

**Usage logging:** Every generation call creates a `compomate_usage_logs` row with `event_type = 'generate-backdrop'`, `model = 'flux'`, and `duration_ms`.

---

## Google Gemini (Reference Photo Analysis)

**Purpose:** Analyze a real photo (e.g., a competitor's composite, a customer's request photo) and generate a matching backdrop description or composition prompt.

**Provider:** Google AI Studio
**Model:** Gemini Flash (multimodal) <!-- TODO: verify exact Gemini model version used -->
**API Key:** `GEMINI_API_KEY`

**Flow:**
```
User: uploads reference photo
  → POST /api/analyze-reference (or similar) <!-- TODO: verify actual route name -->
    → Gemini multimodal API call with image
    → Returns generated prompt / description
  → Prompt pre-filled in AI Generate tab
  → User can edit and generate
```

**Prompt architecture:** Single-turn multimodal call. Image passed as base64 or URL. System instruction asks Gemini to describe the backdrop in a way that would reproduce the visual style. No conversation history maintained.

**Failure behavior:** Analysis fails gracefully — user can still type a prompt manually.

**Usage logging:** Creates `compomate_usage_logs` row with `event_type = 'analyze-reference'`, `model = 'gemini-flash'`.

---

## Sharp — Server-Side Compositing (Not AI)

While not an AI model, Sharp is the core "intelligence" of CompoMate's output quality. The 11-stage pipeline handles:

- **Defringe:** Removes green/blue color spill from subject edges (common in cutout PNGs)
- **Shadow:** Directional shadow computed from light angle + elevation parameters
- **Reflection:** 5-layer progressive blur reflection (see decisions.md)
- **Lightwrap:** Samples backdrop colors at the subject boundary for edge blending

These are deterministic algorithms, not learned models. No AI inference happens in the compositing pipeline.

---

## Rate Limiting for AI Endpoints

Both `/api/generate` (fal.ai) and the reference analysis endpoint are rate-limited to control AI API costs:
- In-process counters by default
- Upstash Redis for distributed limiting in production (see environment.md)
