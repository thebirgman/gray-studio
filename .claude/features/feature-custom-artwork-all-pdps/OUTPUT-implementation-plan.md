# Implementation Plan — Custom Artwork Flow On All Product Pages

## Summary

Every product page uses the custom artwork layout and the `ls-seedream-portrait-flow` upload widget. Each scene PDP opens with its own scene preselected. Built on `feature/custom-artwork-all-pdps` and tested in an unpublished theme. Live only changes when that theme is published after Kathryn approves.

## Decisions

- **Template, not store data.** `templates/product.json` gets the same composition as `product.custom-artwork.json`: the widget app block inside buy buttons, `pdp-intro`, the variant picker moved under buy buttons, reviews on, and no collection browser. We don't reassign any product's `templateSuffix`, because that would hit live right away.
- **The title stays dynamic.** The custom-artwork template hardcodes "Create Your Portrait" on desktop. `product.json` keeps `{{ closest.product.title }}` so each scene shows its own name.
- **One shared condition.** `snippets/custom-artwork-pdp-check.liquid` outputs `true` on product templates with no suffix or the `custom-artwork` suffix. The four former `template.suffix == 'custom-artwork'` checks capture it, so the rule lives in one place.
- **Scene preselect on the theme side.** The existing `<custom-artwork-pdp>` wrapper becomes a web component (`assets/custom-artwork-pdp.js`). It gets the product handle, waits for the app widget to render, switches the collection dropdown to the scene's collection, then clicks that scene's thumb. Products whose handle isn't a scene (e.g. `create-your-portrait`) keep the widget's default. The app extension isn't touched, because a release would reach live.

## Steps

1. Add `snippets/custom-artwork-pdp-check.liquid`.
2. Swap the check into `sections/product-information.liquid`, `blocks/_product-media-gallery.liquid`, `snippets/variant-main-picker.liquid` and `blocks/pdp-trust.liquid`.
3. Add `assets/custom-artwork-pdp.js` and load it from `product-information.liquid`. Pass `data-scene-handle`.
4. Rebuild `templates/product.json` from the custom-artwork template, keeping the dynamic title.
5. Check on the local dev server, then push the branch for an unpublished GitHub-connected theme.

## Known gaps / open items

- `switzerland-matterhorn-trails-pet-portrait` has no matching scene in `/apps/portrait/scenes`, so that PDP falls back to the first scene. The app's scene list needs that scene added.
- "Showcase pages": nothing in the theme is named showcase. Waiting for a URL or a screenshot before adding the "Personalize with your dog" button.
- Collections page: recommendation only (keep `/collections`, remove it from the nav).
