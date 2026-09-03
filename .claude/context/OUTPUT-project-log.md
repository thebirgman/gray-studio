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
