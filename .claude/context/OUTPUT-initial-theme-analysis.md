# Initial Theme Analysis

**Theme:** Horizon: LS Mod  
**Version:** 4.1.0  
**Author (theme_info):** Lantern Sol  
**Store brand in templates:** Pups Around the World (Kathryn Gray / Gray Studio)  
**Analyzed:** 2026-09-15  

This is Shopify **Horizon**, customized by Lantern Sol, then further customized with Gray Studio / Pups marketing sections, PDP blocks, cart rewards, and a custom-artwork product template.

This file is the source of truth for how we build on this theme. **Do not follow Dawn-style conventions** (`padding_top` / `section-[name].css` split files). Follow the patterns below.

---

## 1. Project structure

| Folder | Count | Notes |
|---|---|---|
| `sections/` | 65 `.liquid` | Plus `header-group.json`, `footer-group.json` |
| `snippets/` | 145 | Mix of Horizon helpers (`section`, `spacing-style`) and LS/custom (`ls-*`, `pdp-*`) |
| `blocks/` | 125 | Horizon theme blocks. `_` prefix = private/nested. Custom PDP blocks are `pdp-*` |
| `assets/` | 222 | Almost all JS + images/SVGs. Only 3 CSS files: `base.css`, `overflow-list.css`, `template-giftcard.css` |
| `templates/` | 19 | JSON templates except `gift_card.liquid` and `robots.txt.liquid` |
| `layout/` | 2 | `theme.liquid`, `password.liquid` |
| `locales/` | 51 | Horizon i18n. English schema keys live in `en.default.schema.json` |
| `config/` | 2 | `settings_schema.json`, `settings_data.json` |
| `blocks/` | yes | This is a **Horizon theme-blocks** theme, not Dawn |

**No git repository** was present at analysis time. Feature-branch workflow cannot start until git is initialized.

**No** `.claude/context/reference/` images or brand PDFs.

### Custom vs theme-default (what stands out)

**Gray Studio / Pups marketing sections** (self-contained, BEM, color pickers, often `{% stylesheet %}` in the same file):

- `hero-banner`, `featured-prints`, `featured-collections`, `trust-strip`, `testimonials`, `faqs`, `faqs-page`, `join-the-pack`, `our-craft`, `step-by-step`, `gifts-image-text`
- About: `page-hero`, `about-founder`, `about-statement`, `about-approach`
- Other: `contact-panel`, `collection-header`, `main-page-legal`

**Custom product / cart work:**

- Template: `templates/product.custom-artwork.json`
- Blocks: `pdp-intro`, `pdp-from-price`, `pdp-scene-picker`, `pdp-trust`, `pdp-reviews`, `pdp-faqs`, `_pdp-faq`, `_option-description`
- Snippets: `pdp-main-styles`, `pdp-custom-artwork-styles`, `pdp-frame-finish`, `pdp-guide-modal`, `pdp-option-guide`
- JS: `pdp-buy-now.js`, `pdp-scene-picker.js`, `sticky-add-to-cart.js`, `cart-rewards.js`, `cart-drawer-bestsellers.js`

**Lantern Sol additions** (`ls-*` snippets): SEO/meta, product schema, FAQ schema, organization schema. Loaded from `layout/theme.liquid`.

**Leftover to treat carefully:** `blocks/ai_gen_block_9b1a4f7.liquid` looks generated, not named.

### Custom templates

- `index.json` — homepage of custom sections
- `page.about-us.json`, `page.how-it-works.json`, `page.faq.json`, `page.contact.json`, `page.legal.json`
- `product.json` + `product.custom-artwork.json`

JSON templates include an auto-generated warning. Prefer section/block files over hand-editing JSON unless the task is template composition.

---

## 2. CSS analysis

### Where CSS lives

| File | Role |
|---|---|
| `assets/base.css` | Global Horizon system. **Do not edit unless discussed.** |
| `assets/overflow-list.css` | Overflow list only |
| `assets/template-giftcard.css` | Gift card template |
| `{% stylesheet %}` in sections/blocks/snippets | **Default for new component CSS** |
| `{% style %}` / `{%- style -%}` | Dynamic values that must live-update in the editor (colors, spacing vars) |

There is **no** `section-[feature].css` asset pattern on this theme.

### Page width / containers

Body class: `page-width-{{ settings.page_width }}` (`narrow` | `normal` | `wide`).

Current store setting: **`narrow`**.

From `snippets/theme-styles-variables.liquid`:

```
--narrow-page-width: 90rem;   /* 1440px at 16px rem */
--normal-page-width: 120rem;
--wide-page-width: 150rem;
```

From `assets/base.css`:

```
--page-margin: 12px;                 /* default */
@media (min-width: 750px) { --page-margin: 50px; }

--page-width: calc(var(--page-content-width) + (var(--page-margin) * 2));
```

**Sections are not `max-width + margin: auto`.** They use a 3-column CSS grid so a full-bleed background can sit behind page-width content:

```css
.section {
  display: grid;
  grid-template-columns: var(--full-page-grid-with-margins);
}
.section > * { grid-column: 2; }
.section--page-width > * { grid-column: 2; }
.section--full-width > * { grid-column: 1 / -1; }
.section--narrow { /* caps center column at 720px */ }
.section > .force-full-width { grid-column: 1 / -1; }
```

Background color is applied to a **sibling** `.section-background`, not the `.section` itself (keeps stacking with hero shadows working).

**Always wrap new full-bleed/page-width sections with `class="section section--page-width"` or `section--full-width`**, unless matching an existing custom section that intentionally opts out (see inconsistencies).

### Breakpoints (real values used)

| Value | Use |
|---|---|
| **749px / 750px** | Primary mobile / desktop split. Most custom sections use this. |
| **990px** | Header/html scroll lock, spacing-scale bump (`.spacing-style` uses `--spacing-scale-md` below 990, `--spacing-scale-default` at 990+) |
| **1200px** | Some `base.css` layout rules |
| **1400px** | `.grid` centered-column math |
| **40em / 60em** | Section height tokens (`--section-height-*`) |
| **1440px / 393px** | Fluid `html { font-size }` (see typography) |

Do **not** invent Dawn’s 750-only padding-halving pattern. This theme already has mobile padding settings.

### Grid system

Two systems:

1. **Section shell** — 3-column grid on `.section` (margins | content | margins). This is the layout contract.
2. **`.grid` utility** (in `base.css`) — flex column on mobile; 12-column named grid from 750px; extra outer tracks from 1400px. Used by some Horizon layouts, not by Gray Studio marketing sections.
3. **`.layout-panel-flex` / `.layout-panel-flex--row` / `--column`** — Horizon generic section inner layout. Driven by `{% render 'layout-panel-style' %}`.
4. Custom marketing sections use **flex/grid inside their own BEM block** (`featured-prints__grid`, `trust-strip__list`, etc.).

### Color variables

**Global (from `snippets/color-palette.liquid` on `:root`):**

- `--color-background` / `--color-background-rgb`
- `--color-foreground` / `--color-foreground-rgb`
- `--color-border`
- `--palette-lightest` / `--palette-darkest` (computed from `settings.color_palette`)
- `--color-primary-button-*` and hover variants
- `--color-secondary-button-*`
- `--color-input-*`
- `--color-variant-*` / `--color-selected-variant-*`
- `--color-foreground-muted` / `--color-foreground-subdued`

Current `settings.color_palette` is generic (`background #ffffff`, `foreground #000000`, `color1 #333333`, `color2 #EEF1EA`, `color3 #DFDFDF`). **Brand color lives in custom section settings, not the global palette.**

**Hardcoded tokens in `theme-styles-variables.liquid`:**

- `--color-error: #8B0000`
- `--color-success: #006400`
- `--color-white` / `--color-black`
- stock colors: `--color-instock`, `--color-lowstock`, `--color-outofstock`

**Per-section custom colors** use:

```liquid
{% render 'contrast-override',
  background_color: background_color,
  text_color: text_color,
  section_id: section.id,
  skip_contrast: true
%}
```

That scopes tokens onto `.color-custom-{{ section.id }}`. Gray Studio marketing sections almost always pass `skip_contrast: true` and also set **prefixed CSS vars** on the root element:

| Section | Prefix examples |
|---|---|
| Hero banner | `--hb-bg`, `--hb-text`, `--hb-accent`, `--hb-brand`, `--hb-muted` |
| Featured prints | `--fp-bg`, `--fp-brand`, `--fp-badge` |
| Trust strip | `--trust-strip-bg`, `--trust-strip-text` |
| Join the pack | `--jtp-panel`, `--jtp-brand` |
| Testimonials | `--testimonials-bg`, `--testimonials-border` |
| FAQs | `--faqs-bg`, `--faqs-brand`, `--faqs-border` |

**Brand hexes used as defaults across custom sections:**

| Token | Hex | Typical use |
|---|---|---|
| Cream page | `#FFFDF8` | Homepage / FAQ backgrounds |
| Body text | `#242027` | Primary copy |
| Brand purple | `#321C41` | Headings, CTAs, about panel |
| Accent orange | `#CE6911` | Hero accent |
| Muted gray | `#605C64` | Secondary text, breadcrumbs |
| Soft purple | `#8855AA` | Header bar, badges |
| Lilac | `#C8AFDE` | Trust strip |
| Warm cream panel | `#FAF8F0` | Badges, join-the-pack panel |
| Soft blue | `#F2F7FC` | Testimonials |

There is **no Dawn `color_scheme` / `.color-scheme-1` system**. Do not add one.

### Naming convention

Horizon mix of:

- Utility: `.section`, `.section--page-width`, `.spacing-style`, `.layout-panel-flex`, `.visually-hidden`
- Component: `header-component`, `product-card`, kebab custom-element tags
- Custom Gray Studio: **BEM with section prefix**

Real examples:

```
.hero-banner / .hero-banner__media / .hero-banner__img
.trust-strip / .trust-strip__item / .trust-strip__title
.featured-prints / .featured-prints__grid / .featured-prints__heading
.faqs / .faqs__item / .faqs__question
.pdp-intro
```

New custom UI should use BEM: `.feature-name`, `.feature-name__element`, `.feature-name--modifier`.

### Spacing patterns

Token scale on `:root` (`--padding-xs` … `--padding-6xl`, `--gap-*`, `--margin-*`).

**Section padding is not `padding_top` / `padding_bottom`.** It is:

```liquid
class="spacing-style"
style="{% render 'spacing-style', settings: section.settings %}"
```

Schema IDs (hyphenated, not snake_case):

- `padding-block-start` / `padding-block-end`
- `padding-inline-start` / `padding-inline-end`
- `use_mobile_padding` + `padding-*-mobile`
- Typical range: top/bottom `0–120` step `2`; inline `0–160` step `4`
- Defaults in trust-strip: 40 / 40 / 120 / 120 desktop, 18 / 40 / 25 / 25 mobile

`.spacing-style` in `base.css` applies those CSS variables, with a **mobile override at max-width 749px** and a **scale bump at min-width 990px** (`--spacing-scale-md` → `--spacing-scale-default`).

### Typography

Fonts currently configured:

| Role | Font |
|---|---|
| Body | Lato |
| Subheading | Lato medium |
| Heading | Playfair Display |
| Accent | DM Sans |
| Button | Host Grotesk |

CSS: `--font-body--family`, `--font-heading--family`, `--font-h1--size`, `--font-paragraph--size`, etc.

**Fluid root font size** (`theme-styles-variables.liquid`):

```css
@media only screen and (max-width: 1440px) and (min-width: 750px) {
  html { font-size: calc(16 * 100vw / 1440); }
}
@media only screen and (max-width: 749px) {
  html { font-size: calc(16 * 100vw / 393); }
}
```

`1rem` = 16px at 1440 desktop and 393 mobile. Figma px values convert cleanly to rem at those artboards.

**Inconsistency:** `page-hero`, `testimonials`, and `about-statement` load **Alex Brush from Google Fonts CDN**. Theme fonts should normally come from `settings.type_*` + `snippets/fonts.liquid`. Do not add more Google Fonts links without discussion.

### Other tokens worth reusing

- Z-index: `--layer-section-background` (-2) through `--layer-temporary` (20)
- Radii: `--style-border-radius-sm` … `--style-border-radius-lg`, plus setting-driven button/input radii
- Motion: `--animation-speed`, `--ease-out-quad`, `--animation-timing-hover`
- Focus: `--focus-outline-width`, `--focus-outline-offset`

---

## 3. JavaScript analysis

### Script loading

`snippets/scripts.liquid` is the global loader.

- ES **import map** with `@theme/*` aliases (e.g. `@theme/component`, `@theme/events`)
- Most files: `<script src="..." type="module" fetchpriority="low">`
- Some: `defer` (`auto-close-details.js`, `page-view-event.js`)
- `view-transitions.js` is `async`, optionally `blocking="render"`
- Global `Theme` object (translations + routes) is an inline `<script>` — this is existing theme code, not a pattern to extend with new globals
- New section JS: load with `type="module"` next to the section, same as `trust-strip.liquid`

### Base files — do not modify unless discussed

| File | Why |
|---|---|
| `assets/base.css` | Global layout contract |
| `assets/component.js` | Web component base class |
| `assets/events.js` | ThemeEvents |
| `assets/utilities.js` | Shared helpers, header height CSS vars |
| `assets/scripts.liquid` wait — `snippets/scripts.liquid` | Global import map + script list |
| `layout/theme.liquid` | Document shell |
| Horizon product/cart stack (`product-form.js`, `variant-picker.js`, `cart-drawer.js`, `dialog.js`, etc.) | High blast radius |

Adding a **new** `<script type="module">` line in `scripts.liquid` for a widely used component is OK; editing the import map or `Component` class is not a first move.

### Component model

All new interactive JS should:

1. `import { Component } from '@theme/component'`
2. Extend `Component`
3. Use `ref="name"` in Liquid; read `this.refs.name`
4. Set `requiredRefs` if needed
5. Clean up in `disconnectedCallback` (call `super.disconnectedCallback()`)
6. `customElements.define('feature-name', FeatureName)` **or** `feature-name-component`

Declarative events (Horizon): `on:click="methodName"` attributes, delegated from `component.js`. Custom Gray Studio JS so far prefers explicit `addEventListener` inside the class (see `trust-strip.js`, `featured-collections.js`). Either is valid; stay consistent within a feature.

### Existing custom elements (theme + custom)

Theme defines many tags (`header-component`, `slideshow-component`, `variant-picker`, `product-form-component`, `cart-drawer-component`, `theme-drawer`, …).

**Custom / heavily used Gray Studio tags:**

| Tag | File | Role |
|---|---|---|
| `trust-strip-component` | `trust-strip.js` | Mobile snap carousel + dots |
| `testimonials-component` | `testimonials.js` | Testimonial track |
| `featured-collections-component` | `featured-collections.js` | Filter pills |
| `faqs-page-component` | `faqs-page.js` | FAQ page UI |
| `collection-header-component` | `collection-header.js` | Collection header |
| `pdp-scene-picker` | `pdp-scene-picker.js` | Scene picker on custom artwork PDP |
| `pdp-buy-now` | `pdp-buy-now.js` | Buy-now control |
| `sticky-add-to-cart` | `sticky-add-to-cart.js` | Sticky ATC bar |
| `cart-rewards-controller` | `cart-rewards.js` | Cart rewards |
| `cart-drawer-bestsellers` | `cart-drawer-bestsellers.js` | Bestsellers in drawer |
| `accordion-custom` | `accordion-custom.js` | Accordion |

FAQs **homepage** section is native `<details>` / `<summary>` — no JS.

### Event patterns

`assets/events.js` exports `ThemeEvents`:

- `media:started-playing`
- `quantity-selector:update`
- `megaMenu:hover`
- `zoom-media:selected`
- plus `SlideshowSelectEvent` (`slideshow:select`)

Cart/product communication also uses **Shopify standard events** (`StandardEvents.cartLinesUpdate`, `cartError`, `productSelect`, …) from `@shopify/events` (CDN: `cdn.shopify.com/storefront/standard-events.js`).

Custom drawers use `theme-drawer:open` / `theme-drawer:close`.

`standard-actions-override.js` wires `Shopify.actions.openCart` / `updateCart` to `theme-drawer#cart-drawer`.

### Third-party libraries

| Lib | How | Notes |
|---|---|---|
| GSAP 3.13 + ScrollTrigger | jsDelivr CDN, gated by `settings.gsap_enabled` (currently **true**) | Already a CDN exception |
| Shopify standard-events | Shopify CDN via import map | Required by Horizon |
| Alex Brush | Google Fonts CDN in 3 custom sections | Avoid spreading this |
| model-viewer-ui.css | Shopify CDN | 3D product media |

Project rule says no new CDN libraries. GSAP is already in. Do not add more CDNs.

---

## 4. Liquid patterns

### Layout shell (`layout/theme.liquid`)

Head order: LS meta/seo → `stylesheets` (`base.css`) → `fonts` → `scripts` → `theme-styles-variables` → `color-palette`.

Body: skip link → chat drawer → `#header-group` (`{% sections 'header-group' %}`) → `#MainContent` → footer group → cart rewards → cart drawer → theme drawer → search modal → quick-add modal.

### Two section architectures

**A. Horizon generic (flexible / theme editor blocks)**

```liquid
{% capture children %}
  {% content_for 'blocks' %}
{% endcapture %}

{% render 'section',
  section: section,
  children: children,
  section_id: section.id,
  background_color: section.settings.background_color
%}
```

Used by `sections/section.liquid` and similar. Schema allows `"type": "@theme"` and `"type": "@app"` blocks. Settings are large: layout, width, height, background media, overlay, padding, floating media.

**B. Gray Studio marketing (designed sections)** — this is what homepage/about already use.

```liquid
{%- liquid
  assign background_color = section.settings.background_color | default: '#FFFDF8'
-%}

{% render 'contrast-override',
  background_color: background_color,
  text_color: text_color,
  section_id: section.id,
  skip_contrast: true
%}

<div class="section-background color-custom-{{ section.id }}" style="background-color: {{ background_color }};"></div>

<div
  class="section section--full-width feature-name color-custom-{{ section.id }} spacing-style"
  id="FeatureName-{{ section.id }}"
  style="
    {% render 'spacing-style', settings: section.settings %}
    --fn-bg: {{ background_color }};
  "
>
  ...
</div>

{% stylesheet %}
  .feature-name { ... }
{% endstylesheet %}

{% schema %} ... {% endschema %}
```

**For new designed page sections, follow pattern B** (it is already the house style). Use pattern A only when the merchant needs a freeform Horizon block canvas.

Some custom sections skip `.section` entirely (`join-the-pack`, `faqs`, `testimonials`). That opts them out of the page-width grid. Prefer keeping `.section` unless the design is a full-bleed exception and you match those files on purpose.

### Asset fallbacks

Custom sections often have `image_picker` **plus** `*_asset` text setting pointing at a file in `assets/`. If the picker is blank, they render `{{ asset | asset_url }}`. Keep this when a section must look designed before the merchant uploads images. Do not add new binary images to `assets/` without approval if Shopify Files would do.

### Snippet conventions

- `{% render 'snippet', param: value %}` — isolated scope
- Many snippets have `{% doc %}` headers (Horizon). New snippets should too.
- Spacing: `spacing-style`, `spacing-padding`, `spacing-marging` (typo is upstream, do not “fix” the filename)
- Buttons: `snippets/button.liquid` + `button-custom-styles.liquid`
- Images: `image_url` + `image_tag` with `widths` / `sizes` / `loading`

Most reused helpers: `section`, `spacing-style`, `contrast-override`, `button`, `background-media`, `overlay`, `layout-panel-style`.

### Translation patterns

Horizon default copy uses `{{ 'key' | t }}` and schema `"label": "t:settings.width"`.

Gray Studio custom schemas are **mixed**: some `t:names.trust_strip`, many hardcoded English labels (`"Boxed"`, `"Text color"`, `"Trust item"`). Homepage content is stored as section settings (correct), not Liquid strings.

**Target for new work:** schema labels via `t:` keys in `locales/en.default.schema.json`; merchant-facing defaults can live in schema `default` values. Do not leave new UI strings hardcoded in Liquid.

### Block patterns

- Theme blocks in `blocks/*.liquid` with `{% schema %}` and often `{% stylesheet %}`
- Private blocks: `_product-details.liquid`, `_product-media-gallery.liquid`
- Product page uses **static** `{% content_for 'block', type: '_product-media-gallery', id: 'media-gallery' %}`
- Custom PDP blocks are small, `{ "tag": null }`, presets under `t:categories.product`
- Always put `{{ block.shopify_attributes }}` on the block wrapper

---

## 5. Section patterns deep-dive

### Wrapper class

Use `.section` + `.section--page-width` | `.section--full-width` | `.section--narrow`. Not Dawn `.page-width`.

### Padding

Use `spacing-style` + hyphenated padding settings. **No** `.section-{{ section.id }}-padding` and **no** `padding_top` halved at 750px. That Dawn snippet in the project rules does not exist in this codebase.

### Color

`background_color` color picker + `contrast-override` + `.color-custom-{{ section.id }}`. Optional extra `--prefix-*` vars for design-specific colors.

### Asset loading in sections

| Kind | Pattern |
|---|---|
| CSS | `{% stylesheet %}` in the section/block (Horizon compiles it) |
| Dynamic CSS | `{% style %}` or inline `style="--var: …"` on the root |
| JS | `<script src="{{ 'feature.js' | asset_url }}" type="module" fetchpriority="low">` near the top of the section if only that section needs it |
| Images | `image_tag` + `loading: 'lazy'` except first-screen (`section.index == 1` → `fetchpriority: 'high'`) |
| Icons | `{{ 'icon.svg' | inline_asset_content }}` |

`snippets/stylesheets.liquid` only loads `base.css` (preload) and `overflow-list.css`.

### Common schema structure (custom marketing)

1. Header `t:content.layout` — `section_width` if needed  
2. Content — text, images, URLs  
3. Header `t:content.appearance` — colors  
4. Header `t:content.padding` — `padding-block-*` / `padding-inline-*` + `use_mobile_padding`  
5. `disabled_on.groups`: `["header", "footer"]` unless it belongs there  
6. `presets`: `[{ "name": "t:names.feature_name", "category": "t:categories.other_sections" }]` plus default blocks/settings  

Trust-strip is a good full example of this.

Generic Horizon `sections/section.liquid` schema is huge (layout, media, overlay, floating media). Do not copy that whole schema onto a designed section.

---

## 6. Schema conventions

| Topic | This theme |
|---|---|
| Color schemes | None. Color pickers + `color-custom-{id}` |
| Padding | `padding-block-start` etc., px ranges, optional mobile set |
| Width | `section_width`: `page-width` / `full-width` (trust-strip uses `boxed` as a custom third option) |
| Presets | Always include so the section appears in the customizer |
| Setting types used | `text`, `textarea`, `richtext`, `image_picker`, `url`, `color`, `range`, `select`, `checkbox`, `header`, `collection`, `product` |
| `visible_if` | Used (e.g. boxed-only radius on trust-strip) |
| Translation | Prefer `t:` keys; existing custom sections are inconsistent |

**Schema settings philosophy for new Gray Studio sections:** content + a small brand color set + standard padding. Do not expose every offset (trust-strip already has pixel-level dot offsets — do not spread that).

---

## 7. Asset loading summary

- CSS: `base.css` globally; component CSS via `{% stylesheet %}`
- JS: import map + `type="module"`; section-specific scripts loaded from the section file
- Critical header height: inline IIFE in `theme.liquid` (keep in sync with `utilities.js` if touched)
- Cart type currently **drawer** (`settings.cart_type`)
- Page transitions currently **off**

---

## 8. Reference images

`.claude/context/reference/` does not exist. No brand PDF or screenshot pack in-repo.

Design intent is currently encoded in:

- Custom section defaults and homepage JSON
- Placeholder images in `assets/` (`hero-pups-desktop.png`, `featured-prints-product-*.jpg`, `about-founder.jpg`, …)
- `snippets/pdp-main-styles.liquid` comments that mention Figma px values

---

## 9. How to build a new feature on this theme

1. Create a feature branch (once git exists): `feature/[feature-name]`
2. Add `sections/[feature-name].liquid` (no `section-` prefix required — existing custom files don’t use it)
3. Put CSS in `{% stylesheet %}` in that file
4. If interactive, add `assets/[feature-name].js` as a module extending `Component`, load it from the section
5. Wrap with `.section` + width modifier + `.color-custom-{{ section.id }}` + `contrast-override`
6. Use `spacing-style` for padding
7. BEM class names, scoped `--feature-*` CSS variables
8. Schema: content controls + colors + standard padding + a preset
9. Do **not** create `assets/section-[feature-name].css` unless there is a strong reason
10. Do **not** edit `base.css`, `component.js`, or `variant-picker.js` for a new section

---

## 10. Recommendations / risks

1. **Project rules vs this theme:** `.cursor/rules/project.mdc` describes Dawn file splitting. This analysis overrides that for implementation. Follow Horizon + existing Pups sections.
2. **No git repo** — branching/commit workflow is blocked until `git init` / remote is set up.
3. **Two layout dialects** — some custom sections use `.section` grid, some don’t. New work should use `.section` unless matching a full-bleed exception.
4. **Brand palette vs theme palette** — global `color_palette` is still generic black/white. Custom sections hardcode Pups colors. Long-term, lifting brand tokens into theme settings would reduce hex duplication. Don’t do that mid-feature.
5. **Hardcoded schema English** — new labels should use `t:` keys; migrating old ones is optional cleanup.
6. **Google Fonts CDN** for Alex Brush — extra request + CSP/privacy. Prefer a theme font setting if the script font is a real brand need.
7. **GSAP from jsDelivr** — already enabled. Don’t add a second animation library.
8. **JSON templates are auto-generated** — compose in the customizer when possible; don’t fight Shopify’s overwrite warning.
9. **`ai_gen_block_9b1a4f7.liquid`** — unnamed generated block; don’t reuse.
10. **PDP styles** live in snippets (`pdp-main-styles`, `pdp-custom-artwork-styles`) with some hardcoded hexes (e.g. `.pdp-intro { color: #242027 }`). Prefer CSS variables when touching those files.
11. **Fluid rem** — test at 393px, 749px, 750px, 990px, and 1440px. Pixel-perfect Figma at other widths will drift.
12. **Do not delete or rename Horizon files** to “simplify.” This is a full Horizon theme with LS patches; unused sections still belong to the upstream system.

---

## 11. Homepage / key template map (current)

**Home (`templates/index.json`):** hero-banner → featured-collections → (other custom sections including featured-prints, trust-strip, step-by-step, our-craft, gifts, testimonials, faqs, join-the-pack).

**About (`page.about-us.json`):** page-hero → about-founder → about-statement → about-approach.

**Product:** `product-information` with static media gallery + details; `product.custom-artwork` wraps in `<custom-artwork-pdp>` and adds PDP-specific blocks (scene picker, from-price, trust, FAQs).
