# Project Log — gray-studio

## 2026-09-03 — Removed `product-eyebrow` block from collection template

**What:** Deleted the `product_eyebrow` block (type `product-eyebrow`, empty `text` setting) from the product card group in `templates/collection.json`, and removed it from the corresponding `block_order`.

**Why:** The block was throwing an error on the collection page. It carried no content (`"text": ""`), so removing it costs nothing visually.

**Watch out:** If a `product-eyebrow` block type is reintroduced later, verify the block exists in the theme (`blocks/` or the Horizon block set) before adding it back to a template JSON — a template referencing a block type the theme does not define is the usual cause of this error. Other templates were not touched, so if the same block is present elsewhere it may still error.
