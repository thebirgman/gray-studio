# Custom Artwork Flow On All Product Pages

## Brief

Kathryn (Gray Studio / Pups Around The World) wants every product page to work like the Custom Artwork PDP (`/products/create-your-portrait`). The customer picks a scene, uploads their dog's photo, adds the pet's name and buys a personalized portrait. No scene should be sold as a ready-made, "as is" image.

Source: LanternOS task "Apply Custom Artwork Logic To All Product Pages" (`4ca81a9c-25c6-4a81-bf09-0439b14d84e8`).

**Requirements**
- All scene PDPs use the custom artwork layout and the AI portrait upload flow (`ls-seedream-portrait-flow` app block).
- Each scene PDP opens with its own scene preselected in the widget, not the first scene in the list.
- No "as is" purchase path anywhere on the site.
- Showcase pages use a "Personalize with your dog" button that leads into the flow.
- Must be built and tested without affecting the live theme. Live changes only when the theme is published after client approval.

**Agreed approach (see project log, 2026-11-09)**
- Move the custom artwork flow into the default `product.json` template in an unpublished theme, instead of reassigning product templates (which is store data and hits live immediately).
- Replace the four `template.suffix == 'custom-artwork'` checks with a shared condition: `sections/product-information.liquid`, `blocks/_product-media-gallery.liquid`, `snippets/variant-main-picker.liquid`, `blocks/pdp-trust.liquid`.
- Preselect the scene theme-side. Scene IDs from `/apps/portrait/scenes` equal product handles. App extension releases would affect live.

**Out of scope / recommendation only**
- Removing the Collections page and pointing a Live button to a "Create Now" section. Recommendation: keep `/collections` live, remove it from the nav.

**Open questions**
- Where the Showcase pages live in the theme. Not found yet.
- Whether the app extension can be previewed on this store before release.
- QA: desktop and mobile, plus a test order in preview.


---

## Scoping Questions

[Do not write this manually. This section gets filled in by AI via the `/scope-feature` skill.
AI will write questions here for you to answer by checking boxes and adding notes.]

## Extended Brief

[Do not write this manually. This section gets filled in by AI via the `/scope-feature` skill, after you've answered the scoping questions above.]

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

# feature.md — v1.0

# AI Shopify Developer Bootcamp

# by Coding with Jan

# https://codingwithjan.com

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
