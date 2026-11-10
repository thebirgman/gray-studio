# QA — Custom Artwork Flow On All Product Pages

Test on the unpublished theme `[LS] Custom Artwork All PDPs`: https://zkbzu7-zs.myshopify.com?preview_theme_id=165573066867

**AI pre-check (WebKit, iPhone 15 + desktop 1440):** Staycation, Provence, Paris, Chateau and Palm Beach scenes preselect the right collection and scene. The gallery, the stage and the thumb show the same scene. Add to cart and Buy now are hidden until a preview exists. No horizontal overflow. Create Your Portrait is unchanged.

## Round 1 — Status: Ready for testing

### Scene PDPs
- [ ] A scene PDP (e.g. `/products/provence-poolside-picnic-pet-portrait`) shows the upload widget, the intro and steps starting at 3
- [ ] Its own scene is preselected and the collection dropdown shows its collection (South of France)
- [ ] Scenes in another collection preselect too (try Paris, The Chateau, The Staycation)
- [ ] The title shows the product's name, not "Create Your Portrait"
- [ ] Add to cart and Buy now stay locked until a preview is generated
- [ ] Switching scene after generating requires a new preview
- [ ] Opening a scene from a collection card shows that scene in the gallery, the dropdown and the thumb strip

### Create Your Portrait
- [ ] `/products/create-your-portrait` looks and works as before

### No "as is" path
- [ ] Homepage, collection pages and recommendations only link to the PDP (no quick add)
- [ ] The sticky add-to-cart bar is also locked until a preview exists

### Order
- [ ] A test order carries `_pp_scene`, `_pp_job_id` and `Pet's name` on the line item

### Devices
- [ ] Desktop
- [ ] Mobile (iPhone Safari): widget layout, thumb strip scrolled to the selected scene, upload input

## Previous Rounds

None yet.
