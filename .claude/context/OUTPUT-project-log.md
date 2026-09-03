# Project Log — gray-studio

## 2026-09-03 — Removed `product-eyebrow` block from collection template

**What:** Deleted the `product_eyebrow` block (type `product-eyebrow`, empty `text` setting) from the product card group in `templates/collection.json`, and removed it from the corresponding `block_order`.

**Why:** The block was throwing an error on the collection page. It carried no content (`"text": ""`), so removing it costs nothing visually.

**Watch out:** If a `product-eyebrow` block type is reintroduced later, verify the block exists in the theme (`blocks/` or the Horizon block set) before adding it back to a template JSON — a template referencing a block type the theme does not define is the usual cause of this error. Other templates were not touched, so if the same block is present elsewhere it may still error.

## 2026-09-03 — New `contact-panel` section (Figma 8306:6292 desktop / 8306:6032 mobile)

**What:** New `sections/contact-panel.liquid` — full-bleed background image behind a centred two-panel card: dark heading panel (paw icons + Playfair heading) and light form panel (intro, name/email/phone/message, submit). Plus `snippets/icon-paw.liquid` and `snippets/icon-arrow-right-long.liquid`. Added to `templates/page.contact.json`, replacing the old generic `form` section.

**Why a new section, not `blocks/contact-form.liquid`:** that block is core Horizon and reused elsewhere; this design is a whole composed section. Modelled on `sections/join-the-pack.liquid`.

**Key decisions**
- CSS custom properties are emitted in a `{% style %}` block, **not** an inline `style=""` attribute. `settings.type_button_font.family` returns a *quoted* family name, which closes the attribute early and silently drops every declaration after it. This cost a debugging cycle — do not put font families in inline style attributes.
- The theme never emits `font_face` for `settings.type_button_font`, and `--font-button--family` is **not defined anywhere** (`theme-styles-variables.liquid` only defines body/subheading/heading/accent). Existing sections that use `var(--font-button--family, var(--font-body--family))` are therefore silently falling back to the body font. This section emits its own scoped `font_face` + `--cp-button-font`. Worth fixing globally in `theme-styles-variables.liquid`.
- Input backgrounds: `base.css` uses `textarea, input:not([type="checkbox"], [type="radio"])` (specificity 0-1-1), which beats a single class (0-1-0) for `<input>` but not for `<textarea>` — producing mismatched fields. Fixed by setting the theme's own `--color-input-*` tokens on the section, per the guidance in `contrast-override.liquid`.
- `contrast-override` is deliberately **not** rendered here: the section has two different panel backgrounds and an image backdrop, so a single section-wide background token doesn't apply.
- Panel bottom padding is `0`; the form's own `padding-block: 30px` produces the bottom gap. Figma's fixed-height inner frame overflows its parent's bottom padding, and this reproduces that exactly (verified: aside inner 504px, form 490px, intro top 210px, button bottom 580px — all identical to Figma).

**Verified** against the live dev server at 1440px and 390px: card 1200×610, panels 600×610, inset 105×139, button 194.9px wide vs Figma 194.

**Risks / open**
- Built directly on `main`, against the project's feature-branch rule. Not committed.
- Images are `image_picker`-only (no filename fallback), set in the template to `shopify://shop_images/contact-bg.webp` and `contact-thumbnail.webp`. A fresh preset instance renders with no imagery until images are picked.
- Both name and email are `required`; the theme's `blocks.contact_form.*` translation keys are reused for the visually-hidden labels.

### Breakpoint QA — contact-panel (2026-09-03)

The theme drives a **fluid root font-size**, so all rem values scale. This is why the section must be authored in rem:

```
@media (max-width:1440px) and (min-width:750px) { html { font-size: calc(1.11111vw) }  /* 16px @1440 */ }
@media (max-width:749px)                        { html { font-size: calc(4.07125vw) }  /* caps at 16px */ }
```

| Viewport | Root | Layout | Card | Result |
|---|---|---|---|---|
| 1920 | 16px | row | 1200x610 | Card caps at 75rem and centres — exact Figma desktop |
| 1440 | 16px | row | 1200x610 | 1:1 with Figma desktop (button 194.9 vs 194) |
| 1024 | 11.38px | row | 853x434 | Uniform 71% scale, proportions intact |
| 768 | 8.54px | row | 640x326 | Uniform 53% scale, proportions intact |
| 749 | 16px | column | 368 wide | Mobile layout at exact Figma mobile width, centred |
| 390 | 15.89px | column | 358 wide | 99.3% of Figma mobile (theme's mobile baseline is 393px, not 390) |

No horizontal overflow at any width. Layout switches at 750px, matching the theme's own breakpoint.

**Note on 768/1024:** body text renders at 8.5px / 11.4px there. That is theme-wide, not specific to this section — the header nav, footer links and every other section scale identically at those widths. Flagged as a pre-existing theme characteristic for tablet widths; not changed here.

### Fix — button arrow was stretched (2026-09-03)

`.contact-panel__submit-icon svg` used `width: 100%; height: auto`, which stretched the tight-cropped 18x11 arrow artwork to fill the 24x24 slot (drawing it at 24x14.7, ~33% oversized).

Figma's icon is the *same glyph* but exported inside a 24x24 frame — every coordinate is the 18x11 version offset by exactly (+3, +6.96094), i.e. centred with 3px horizontal padding. Fixed by giving the svg its true `1.125rem x 0.6875rem` and letting the flex-centred slot supply the 3px.

**Why this was easy to miss:** total button width was unaffected (the 24px slot is the flex item either way), so the 194.9-vs-194 measurement still matched. Only the artwork scale and the *visual* text-to-arrow gap were wrong — 8px instead of Figma's 11px (8px `gap` + 3px slot padding). When checking icon fidelity, measure the `<svg>` box, not just the slot or the parent.

## 2026-09-03 — Link-style button options + text block 28px

**What:**
- `blocks/text.liquid` — added a 28px (`1.75rem`) option to both the desktop and mobile font-size selects.
- `snippets/button.liquid` + `snippets/button-custom-styles.liquid` + `blocks/button.liquid` — new opt-in options for the link style (`button-unstyled`): underline, arrow icon, hover color, font family, font size, font weight. Plus explicit hover background/text/border for `button-custom`.
- `templates/page.contact.json` — applied to the four FAQ links, added a hover to "Sign in to track", and set section/card padding.

**Key decisions**
- **Everything is opt-in and defaults to blank/false.** `snippets/button.liquid` is shared by `blocks/button.liquid`, `_blog-post-card-button` and `_product-list-button`, and `button-unstyled` is used all over the theme — so no existing usage changes appearance.
- The "underline" in the design is a **bottom border on the container** (0.5px, full width including the icon) with `padding-block: 4px` producing the offset — not `text-decoration`. Implemented with `border-bottom: 0.03125rem solid currentColor`, so it tracks the link color and its hover.
- **Reused `icon-arrow-right-long` rather than adding a second arrow snippet.** The 14x8 artwork supplied for the links is the same glyph as the 18x11 one, scaled by exactly 0.75 (every coordinate matches). Rendering the existing snippet at `0.84375rem x 0.515625rem` inside an 18px slot reproduces it exactly. Beware: a naive coordinate-ratio comparison reports "different" because the SVG's 6-digit rounding gives 0.75 ± 0.000004.
- `resolve-custom-hover` already accepted `hover_bg`/`hover_text`/`hover_border`; `button-custom-styles` simply never passed them. Wiring them through was all that was needed for custom-button hover — no new hover logic.
- The design's generated code carries a `uppercase` class, but both exported screenshots render sentence case. Followed the screenshots; no `text-transform`.

**Applied values (contact template)**
- Four FAQ links: accent font (DM Sans), 15px, weight 700, underline. Three have the arrow icon and `#595A1B`; "See all FAQs" has no icon and `#321C41`. All hover to `#8855AA` (the expansion of the `#85A` shorthand — stored 6-digit so Shopify's color setting and `.rgba` parse it reliably).
- "Sign in to track" (`button-custom`): hover fills `#321C41` with `#FFFDF8` text, matching the contact panel button.
- FAQ section padding-bottom 80 desktop / 60 mobile (`use_mobile_padding` had to be enabled; its other mobile values already matched desktop's zeros). The three cards: padding-bottom 43 desktop.

**Risk:** the link typography settings (family/size/weight) are more design-level control than the CMS-style settings the project usually favours. They were needed because the design's link is 15px accent-bold while `button-unstyled` renders 16px Lato, and adding them beat hard-coding typography into a shared snippet.
