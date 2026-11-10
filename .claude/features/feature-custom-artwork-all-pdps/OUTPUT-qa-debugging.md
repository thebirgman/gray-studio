# QA — Custom Artwork Flow On All Product Pages

Test on the theme connected from branch `feature/custom-artwork-all-pdps` (preview only, not live).

## Round 1 — Status: Ready for testing

### Scene PDPs
- [ ] A scene PDP (e.g. `/products/provence-poolside-picnic-pet-portrait`) shows the upload widget, the intro and steps starting at 3
- [ ] Its own scene is preselected and the collection dropdown shows its collection (South of France)
- [ ] Scenes in another collection preselect too (try Paris, The Chateau, The Staycation)
- [ ] The title shows the product's name, not "Create Your Portrait"
- [ ] Add to cart and Buy now stay locked until a preview is generated
- [ ] Switching scene after generating requires a new preview
- [ ] `/products/switzerland-matterhorn-trails-pet-portrait`: known gap, opens on the first scene

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
