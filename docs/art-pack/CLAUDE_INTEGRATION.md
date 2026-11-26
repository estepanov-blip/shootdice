# SHOOT DICE — Art integration only

The playable build already exists. Do not scaffold a new project or change the engine, rules, RNG, economy, networking, or existing functionality.

- `assets/`: 3 portrait backgrounds and 12 flat dice face textures; use for initial integration. Dice face filenames encode the displayed value. Never derive game outcomes from animations.
- `draft_assets/`: 2 idle illustrations, 2 avatars and 3 basic button textures. Inspect alpha and cropping before use; idle illustrations are not certified transparent sprites.
- `references/`: original artwork and cropped comic panels. Do not load as production sprites by default. BIG ROC action panels have the wrong outfit: use black beanie, white tank, olive cargo pants, tan boots. KILLA TEE should match approved red jacket and white shirt.
- UI and VFX sheets are visual references, not sliced atlases. Recreate visual styling using existing UI components; do not add features shown only in mockups.
- Preserve existing screen layout and responsive behavior; adapt backgrounds without stretching. Map visual states to existing events. Use idle fallback until clean action sprites exist.
- Keep all gameplay logic unchanged. Run existing tests and build, compare before/after screenshots, and report missing assets and regressions.

Missing: clean isolated action sprites, production UI/VFX atlas, standalone logo, audio. Do not mark these complete.
