import { Component } from '@theme/component';
import { morph, MORPH_OPTIONS } from '@theme/morph';
import { OverflowList } from '@theme/overflow-list';
import { yieldToMainThread, getViewParameterValue, ResizeNotifier } from '@theme/utilities';
import { ProductSelectEvent } from '@shopify/events';

/**
 * @typedef {object} VariantPickerRefs
 * @property {HTMLFieldSetElement[]} fieldsets - The fieldset elements.
 * @property {HTMLElement} [overflowList] - The overflow list element.
 */

/**
 * A custom element that manages a variant picker.
 *
 * @template {import('@theme/component').Refs} [TRefs=VariantPickerRefs]
 * @extends Component<TRefs>
 */
export default class VariantPicker extends Component {
  /** @type {string | undefined} */
  #pendingRequestUrl;

  /** @type {AbortController | undefined} */
  #abortController;

  /** @type {number[][]} */
  #checkedIndices = [];

  /** @type {HTMLInputElement[][]} */
  #radios = [];

  /** @type {string} */
  #frameFinishValue = 'Black frame';

  connectedCallback() {
    super.connectedCallback();
    const fieldsets = /** @type {HTMLFieldSetElement[]} */ (this.refs.fieldsets || []);

    fieldsets.forEach((fieldset) => {
      const radios = Array.from(fieldset?.querySelectorAll('input') ?? []);
      this.#radios.push(radios);

      const initialCheckedIndex = radios.findIndex((radio) => radio.dataset.currentChecked === 'true');
      if (initialCheckedIndex !== -1) {
        this.#checkedIndices.push([initialCheckedIndex]);
      }
    });

    this.addEventListener('change', this.variantChanged.bind(this));
    this.#resizeObserver.observe(this);
    this.recomputeAvailability();
    this.#syncDescribedAxesVisibility();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.#resizeObserver.disconnect();
  }

  /**
   * Handles the variant change event.
   * @param {Event} event - The variant change event.
   */
  variantChanged(event) {
    if (!(event.target instanceof HTMLElement)) return;

    if (event.target instanceof HTMLInputElement && event.target.name.startsWith('properties')) {
      this.#captureFrameFinish();
      return;
    }

    const selectedOption =
      event.target instanceof HTMLSelectElement ? event.target.options[event.target.selectedIndex] : event.target;

    if (!selectedOption) return;

    this.updateSelectedOption(event.target);
    if (event.target instanceof HTMLInputElement) {
      this.#reconcileDescribedSelection(event.target);
    }
    this.recomputeAvailability();

    const isOnProductPage =
      this.dataset.templateProductMatch === 'true' &&
      !event.target.closest('product-card') &&
      !event.target.closest('quick-add-dialog');

    // Morph the entire main content for combined listings child products, because changing the product
    // might also change other sections depending on recommendations, metafields, etc.
    const currentUrl = this.dataset.productUrl?.split('?')[0];
    const newUrl = selectedOption.dataset.connectedProductUrl;
    const loadsNewProduct = isOnProductPage && !!newUrl && newUrl !== currentUrl;
    const isOnFeaturedProductSection = Boolean(this.closest('featured-product-information'));

    const morphElementSelector = loadsNewProduct
      ? 'main'
      : isOnFeaturedProductSection
      ? 'featured-product-information'
      : undefined;

    const optionValueId = selectedOption.dataset.optionValueId ?? '';
    this.fetchUpdatedSection(this.buildRequestUrl(selectedOption), morphElementSelector, optionValueId);

    const url = new URL(window.location.href);

    const resolvedVariant = this.#findSelectedVariant();
    const variantId = resolvedVariant?.id != null ? String(resolvedVariant.id) : selectedOption.dataset.variantId || null;

    if (isOnProductPage) {
      if (variantId) {
        url.searchParams.set('variant', variantId);
      } else {
        url.searchParams.delete('variant');
      }
    }

    // Change the path if the option is connected to another product via combined listing.
    if (loadsNewProduct) {
      url.pathname = newUrl;
    }

    if (url.href !== window.location.href) {
      yieldToMainThread().then(() => {
        history.replaceState({}, '', url.toString());
      });
    }
  }

  /**
   * @typedef {object} FieldsetMeasurements
   * @property {HTMLFieldSetElement} fieldset
   * @property {number | undefined} currentIndex
   * @property {number | undefined} previousIndex
   * @property {number | undefined} currentWidth
   * @property {number | undefined} previousWidth
   */

  /**
   * Gets measurements for a single fieldset (read phase).
   * @param {number} fieldsetIndex
   * @returns {FieldsetMeasurements | null}
   */
  #getFieldsetMeasurements(fieldsetIndex) {
    const fieldsets = /** @type {HTMLFieldSetElement[]} */ (this.refs.fieldsets || []);
    const fieldset = fieldsets[fieldsetIndex];
    const checkedIndices = this.#checkedIndices[fieldsetIndex];
    const radios = this.#radios[fieldsetIndex];

    if (!radios || !checkedIndices || !fieldset) return null;

    const [currentIndex, previousIndex] = checkedIndices;

    return {
      fieldset,
      currentIndex,
      previousIndex,
      currentWidth: currentIndex !== undefined ? radios[currentIndex]?.parentElement?.offsetWidth : undefined,
      previousWidth: previousIndex !== undefined ? radios[previousIndex]?.parentElement?.offsetWidth : undefined,
    };
  }

  /**
   * Applies measurements to a fieldset (write phase).
   * @param {FieldsetMeasurements} measurements
   */
  #applyFieldsetMeasurements({ fieldset, currentWidth, previousWidth, currentIndex, previousIndex }) {
    if (currentWidth) {
      fieldset.style.setProperty('--pill-width-current', `${currentWidth}px`);
    } else if (currentIndex !== undefined) {
      fieldset.style.removeProperty('--pill-width-current');
    }

    if (previousWidth) {
      fieldset.style.setProperty('--pill-width-previous', `${previousWidth}px`);
    } else if (previousIndex !== undefined) {
      fieldset.style.removeProperty('--pill-width-previous');
    }
  }

  /**
   * Updates the fieldset CSS.
   * @param {number} fieldsetIndex - The fieldset index.
   */
  updateFieldsetCss(fieldsetIndex) {
    if (Number.isNaN(fieldsetIndex)) return;

    const measurements = this.#getFieldsetMeasurements(fieldsetIndex);
    if (measurements) {
      this.#applyFieldsetMeasurements(measurements);
    }
  }

  /**
   * Updates the selected option.
   * @param {string | Element} target - The target element.
   */
  updateSelectedOption(target) {
    if (typeof target === 'string') {
      const targetElement = this.querySelector(`[data-option-value-id="${target}"]`);

      if (!targetElement) throw new Error('Target element not found');

      target = targetElement;
    }

    if (target instanceof HTMLInputElement) {
      const fieldsetIndex = Number.parseInt(target.dataset.fieldsetIndex || '');
      const inputIndex = Number.parseInt(target.dataset.inputIndex || '');

      if (!Number.isNaN(fieldsetIndex) && !Number.isNaN(inputIndex)) {
        const fieldsets = /** @type {HTMLFieldSetElement[]} */ (this.refs.fieldsets || []);
        const fieldset = fieldsets[fieldsetIndex];
        const checkedIndices = this.#checkedIndices[fieldsetIndex];
        const radios = this.#radios[fieldsetIndex];

        if (radios && checkedIndices && fieldset) {
          // Clear previous checked states
          const [currentIndex, previousIndex] = checkedIndices;

          if (currentIndex !== undefined && radios[currentIndex]) {
            radios[currentIndex].dataset.previousChecked = 'false';
          }
          if (previousIndex !== undefined && radios[previousIndex]) {
            radios[previousIndex].dataset.previousChecked = 'false';
          }

          // Update checked indices array - keep only the last 2 selections
          checkedIndices.unshift(inputIndex);
          checkedIndices.length = Math.min(checkedIndices.length, 2);

          // Update the new states
          const newCurrentIndex = checkedIndices[0]; // This is always inputIndex
          const newPreviousIndex = checkedIndices[1]; // This might be undefined

          // newCurrentIndex is guaranteed to exist since we just added it
          if (newCurrentIndex !== undefined && radios[newCurrentIndex]) {
            radios[newCurrentIndex].dataset.currentChecked = 'true';
          }

          if (newPreviousIndex !== undefined && radios[newPreviousIndex]) {
            radios[newPreviousIndex].dataset.previousChecked = 'true';
            radios[newPreviousIndex].dataset.currentChecked = 'false';
          }

          this.updateFieldsetCss(fieldsetIndex);
        }
      }
      target.checked = true;
    }

    if (target instanceof HTMLSelectElement) {
      const newValue = target.value;
      const newSelectedOption = Array.from(target.options).find((option) => option.value === newValue);

      if (!newSelectedOption) throw new Error('Option not found');

      for (const option of target.options) {
        option.removeAttribute('selected');
      }

      newSelectedOption.setAttribute('selected', 'selected');
    }
  }

  /**
   * Builds the request URL.
   * @param {HTMLElement} selectedOption - The selected option.
   * @param {string | null} [source] - The source.
   * @param {string[]} [sourceSelectedOptionsValues] - The source selected options values.
   * @returns {string} The request URL.
   */
  buildRequestUrl(selectedOption, source = null, sourceSelectedOptionsValues = []) {
    // this productUrl and pendingRequestUrl will be useful for the support of combined listing. It is used when a user changes variant quickly and those products are using separate URLs (combined listing).
    // We create a new URL and abort the previous fetch request if it's still pending.
    let productUrl = selectedOption.dataset.connectedProductUrl || this.#pendingRequestUrl || this.dataset.productUrl;
    this.#pendingRequestUrl = productUrl;
    const params = [];
    const viewParamValue = getViewParameterValue();

    // preserve view parameter, if it exists, for alternative product view testing
    if (viewParamValue) params.push(`view=${viewParamValue}`);

    if (this.selectedOptionsValues.length && !source) {
      params.push(`option_values=${this.selectedOptionsValues.join(',')}`);
    } else if (source === 'product-card') {
      if (this.selectedOptionsValues.length) {
        params.push(`option_values=${sourceSelectedOptionsValues.join(',')}`);
      } else {
        params.push(`option_values=${selectedOption.dataset.optionValueId}`);
      }
    }

    // If variant-picker is a child of some specific sections, we need to append section_id=xxxx to the URL
    const SECTION_ID_MAP = {
      'quick-add-component': 'section-rendering-product-card',
      'swatches-variant-picker-component': 'section-rendering-product-card',
      'featured-product-information': this.closest('featured-product-information')?.id,
    };

    const closestSectionId = /** @type {keyof typeof SECTION_ID_MAP} | undefined */ (
      Object.keys(SECTION_ID_MAP).find((sectionId) => this.closest(sectionId))
    );

    if (closestSectionId) {
      if (productUrl?.includes('?')) {
        productUrl = productUrl.split('?')[0];
      }
      return `${productUrl}?section_id=${SECTION_ID_MAP[closestSectionId]}&${params.join('&')}`;
    }

    return `${productUrl}?${params.join('&')}`;
  }

  /**
   * Fetches the updated section.
   * @param {string} requestUrl - The request URL.
   * @param {string} [morphElementSelector] - The selector of the element to be morphed. By default, only the variant picker is morphed.
   * @param {string} [optionValueId] - The selected option value ID for event detail.
   */
  fetchUpdatedSection(requestUrl, morphElementSelector, optionValueId = '') {
    // We use this to abort the previous fetch request if it's still pending.
    this.#abortController?.abort();
    this.#abortController = new AbortController();

    const deferredEventPromise = ProductSelectEvent.createPromise();
    const selectedOptions = this.getAllSelectedOptions();

    this.dispatchEvent(
      new ProductSelectEvent({
        product: {
          id: this.dataset.productId ?? '',
          title: this.dataset.productTitle ?? '',
          handle: this.dataset.productHandle ?? '',
        },
        selectedOptions,
        detail: {
          optionValueId,
        },
        promise: deferredEventPromise.promise,
      })
    );

    fetch(requestUrl, { signal: this.#abortController.signal })
      .then((response) => response.text())
      .then((responseText) => {
        this.#pendingRequestUrl = undefined;
        const html = new DOMParser().parseFromString(responseText, 'text/html');
        // Defer is only useful for the initial rendering of the page. Remove it here.
        html.querySelector('overflow-list[defer]')?.removeAttribute('defer');

        const variantPickerJsonScript = html.querySelector(`variant-picker script[type="application/json"]`);
        const textContent = variantPickerJsonScript?.textContent;

        if (!textContent) {
          deferredEventPromise.resolve({
            variant: null,
            detail: {
              html,
              productId: this.dataset.productId ?? '',
              sourceId: this.selectedOptionId,
              resource: null,
            },
          });
          return;
        }

        let newProduct;

        if (morphElementSelector === 'main') {
          this.updateMain(html);
        } else if (morphElementSelector) {
          this.updateElement(html, morphElementSelector);
        } else {
          const { overflowList } = this.refs;
          const wasSwatchesExpanded =
            overflowList instanceof OverflowList && overflowList.getAttribute('disabled') === 'true';

          newProduct = this.updateVariantPicker(html);

          if (wasSwatchesExpanded) {
            const overflowListAfterMorph = overflowList;
            if (overflowListAfterMorph instanceof OverflowList) {
              overflowListAfterMorph.showAll();
            }
          }
        }

        // Resolve the ProductSelectEvent promise with all data needed by listeners
        if (this.selectedOptionId) {
          const variantData = JSON.parse(textContent);

          if (variantData && typeof variantData === 'object') {
            const productViewAttr = variantPickerJsonScript
              ?.closest('[view-event-payload]')
              ?.getAttribute('view-event-payload')
              ?.trim();

            deferredEventPromise.resolve({
              variant: (productViewAttr && JSON.parse(productViewAttr))?.product?.selectedVariant ?? null,
              detail: {
                html,
                productId: this.dataset.productId ?? '',
                newProduct,
                sourceId: this.selectedOptionId,
                resource: variantData,
              },
            });

            return;
          }
        }

        // Variant data is null/invalid (e.g. unavailable variant combination) —
        // still include detail with html so listeners can update UI (disable buttons, morph text)
        deferredEventPromise.resolve({
          variant: null,
          detail: {
            html,
            productId: this.dataset.productId ?? '',
            newProduct,
            sourceId: this.selectedOptionId,
            resource: null,
          },
        });
      })
      .catch((error) => {
        deferredEventPromise.reject(error);
        if (error.name === 'AbortError') {
          console.warn('Fetch aborted by user');
        } else {
          console.error(error);
        }
      });
  }

  /**
   * @typedef {Object} NewProduct
   * @property {string} id
   * @property {string} url
   */

  /**
   * Re-renders the variant picker.
   * @param {Document | Element} newHtml - The new HTML.
   * @returns {NewProduct | undefined} Information about the new product if it has changed, otherwise undefined.
   */
  updateVariantPicker(newHtml) {
    /** @type {NewProduct | undefined} */
    let newProduct;

    const newVariantPickerSource = newHtml.querySelector(this.tagName.toLowerCase());

    if (!newVariantPickerSource) {
      throw new Error('No new variant picker source found');
    }

    // For combined listings, the product might have changed, so update the related data attribute.
    if (newVariantPickerSource instanceof HTMLElement) {
      const newProductId = newVariantPickerSource.dataset.productId;
      const newProductUrl = newVariantPickerSource.dataset.productUrl;

      if (newProductId && newProductUrl && this.dataset.productId !== newProductId) {
        newProduct = { id: newProductId, url: newProductUrl };
      }

      this.dataset.productId = newProductId;
      this.dataset.productUrl = newProductUrl;
    }

    this.#captureFrameFinish();

    morph(this, newVariantPickerSource, {
      ...MORPH_OPTIONS,
      getNodeKey: (node) => {
        if (!(node instanceof HTMLElement)) return undefined;
        const key = node.dataset.key;
        return key;
      },
    });
    this.updateVariantPickerCss();

    // After morph, refresh radio caches and reapply correct cross-option
    // availability — Shopify's server-side computation is unreliable for some
    // selection paths (see snippets/variant-main-picker.liquid for context).
    this.#refreshRadioCaches();
    this.#restoreFrameFinish();
    this.recomputeAvailability();
    this.#syncDescribedAxesVisibility();

    return newProduct;
  }

  /**
   * Re-reads the radio elements after a morph so subsequent reads stay in sync
   * with the new DOM. The morph reuses fieldset elements but replaces inputs,
   * so the cached references can go stale.
   */
  #refreshRadioCaches() {
    const fieldsets = /** @type {HTMLFieldSetElement[]} */ (this.refs.fieldsets || []);
    this.#radios = fieldsets.map((fieldset) =>
      Array.from(fieldset?.querySelectorAll('input') ?? [])
    );
  }

  /**
   * Format/Size cards are not a strict Shopify combination grid. Digital
   * Download only exists with a hidden "Digital file" size, so combination
   * availability would strike every other card. When the clicked option has
   * no variant with the current other selections, pick the best available
   * variant that includes the new option (prefer keeping the other axis,
   * then Medium).
   * @param {HTMLInputElement} changedInput
   */
  #reconcileDescribedSelection(changedInput) {
    if (!this.#isDescribedPicker()) return;

    const variants = this.#readAllVariants();
    if (!variants?.length) return;

    const fieldsets = /** @type {HTMLFieldSetElement[]} */ (this.refs.fieldsets || []);
    const changedIndex = Number.parseInt(changedInput.dataset.fieldsetIndex || '', 10);
    if (Number.isNaN(changedIndex)) return;

    /** @type {(string | null)[]} */
    const selectedByPosition = fieldsets.map((fieldset, index) => {
      if (index === changedIndex) return changedInput.value;
      const checked = fieldset.querySelector('input:checked');
      return checked instanceof HTMLInputElement ? checked.value : null;
    });

    const matchesSelection = (/** @type {{options: string[]}} */ variant) =>
      variant.options.every((option, index) => {
        const selected = selectedByPosition[index];
        return selected == null || option === selected;
      });

    const exact = variants.find((variant) => variant.available && matchesSelection(variant));
    const formatIndex = fieldsets.findIndex((fieldset) => fieldset.classList.contains('variant-option--format'));
    const sizeIndex = fieldsets.findIndex((fieldset) => fieldset.classList.contains('variant-option--size'));
    const formatIsDigital = /digital/i.test(String(selectedByPosition[formatIndex] ?? ''));
    const sizeIsDigital = /digital/i.test(String(selectedByPosition[sizeIndex] ?? ''));
    const invalidDigitalPairing = formatIndex >= 0 && sizeIndex >= 0 && formatIsDigital !== sizeIsDigital;

    if (exact && !invalidDigitalPairing) {
      this.#syncDescribedAxesVisibility();
      return;
    }

    const candidates = variants.filter((variant) => {
      if (!variant.available) return false;
      const option = String(variant.options[changedIndex] ?? '');
      return option === changedInput.value || option.trim().toLowerCase() === String(changedInput.value || '').trim().toLowerCase();
    });
    if (candidates.length === 0) return;

    const score = (/** @type {{options: string[]}} */ variant) => {
      let total = 0;
      variant.options.forEach((option, index) => {
        if (index === changedIndex) return;
        if (option === selectedByPosition[index]) total += 10;
      });
      if (sizeIndex >= 0 && changedIndex !== sizeIndex) {
        const sizeValue = variant.options[sizeIndex] || '';
        if (/digital/i.test(sizeValue)) total -= 20;
        else if (/medium/i.test(sizeValue)) total += 2;
        else if (/small/i.test(sizeValue)) total += 1;
      }
      return total;
    };

    candidates.sort((a, b) => score(b) - score(a));
    const best = candidates[0];
    if (!best) return;

    fieldsets.forEach((fieldset, index) => {
      if (index === changedIndex) return;
      const desired = best.options[index];
      const input = Array.from(fieldset.querySelectorAll('input')).find(
        (candidate) => candidate instanceof HTMLInputElement && candidate.value === desired
      );
      if (input instanceof HTMLInputElement && !input.checked) {
        this.updateSelectedOption(input);
      }
    });

    this.#syncDescribedAxesVisibility();
  }

  /**
   * @returns {{id: number, available: boolean, options: string[]} | null}
   */
  #findSelectedVariant() {
    const variants = this.#readAllVariants();
    if (!variants?.length) return null;

    const fieldsets = /** @type {HTMLFieldSetElement[]} */ (this.refs.fieldsets || []);
    const selected = fieldsets.map((fieldset) => {
      const checked = fieldset.querySelector('input:checked');
      return checked instanceof HTMLInputElement ? checked.value : null;
    });

    return (
      variants.find((variant) => variant.options.every((option, index) => option === selected[index])) ?? null
    );
  }

  /** @returns {boolean} */
  #isDescribedPicker() {
    return this.classList.contains('variant-picker--described');
  }

  /**
   * @param {Element | null} input
   * @returns {boolean}
   */
  #isDigitalOption(input) {
    if (!(input instanceof HTMLInputElement)) return false;
    return (input.dataset.optionHandle || '').includes('digital');
  }

  /** @param {Element | null} input */
  #isFramedFormat(input) {
    if (!(input instanceof HTMLInputElement)) return false;
    const handle = input.dataset.optionHandle || '';
    if (handle.includes('digital') || handle.includes('unframed')) return false;
    return handle.includes('framed');
  }

  /** @returns {HTMLFieldSetElement | null} */
  #getFrameFinishProperty() {
    const root = this.querySelector('[data-frame-finish-property]');
    return root instanceof HTMLFieldSetElement ? root : null;
  }

  #captureFrameFinish() {
    const checked = this.#getFrameFinishProperty()?.querySelector('input:checked');
    if (checked instanceof HTMLInputElement && !checked.disabled) {
      this.#frameFinishValue = checked.value;
    }
  }

  #restoreFrameFinish() {
    const fieldset = this.#getFrameFinishProperty();
    if (!fieldset) return;
    const match = Array.from(fieldset.querySelectorAll('input')).find(
      (input) => input instanceof HTMLInputElement && input.value === this.#frameFinishValue
    );
    if (match instanceof HTMLInputElement) {
      match.checked = true;
    }
  }

  #syncFrameFinishProperty(showFinish) {
    const fieldset = this.#getFrameFinishProperty();
    if (!fieldset) return;
    fieldset.toggleAttribute('hidden', !showFinish);
    fieldset.querySelectorAll('input').forEach((input) => {
      if (!(input instanceof HTMLInputElement)) return;
      input.disabled = !showFinish;
      if (showFinish && input.value === this.#frameFinishValue) {
        input.checked = true;
      }
    });
  }

  #syncDescribedAxesVisibility() {
    if (!this.#isDescribedPicker()) return;
    const fieldsets = /** @type {HTMLFieldSetElement[]} */ (this.refs.fieldsets || []);

    const formatFieldset = fieldsets.find(
      (fieldset) =>
        fieldset.classList.contains('variant-option--format') || fieldset.classList.contains('variant-option--cards')
    );
    const formatChecked = formatFieldset?.querySelector('input:checked') ?? null;
    const formatIsDigital = this.#isDigitalOption(formatChecked);

    const sizeFieldset = fieldsets.find((fieldset) => fieldset.classList.contains('variant-option--size'));
    if (sizeFieldset) {
      sizeFieldset.toggleAttribute('hidden', formatIsDigital);
    }

    const showFinish = this.#isFramedFormat(formatChecked) && !formatIsDigital;
    this.#syncFrameFinishProperty(showFinish);
  }

  /**
   * Recomputes availability for every option value based on the full variants
   * table embedded in the picker, then updates each radio's
   * `data-option-available`, `aria-disabled`, and the strikethrough SVG.
   *
   * For each option position P and each option value V at that position, V is
   * available iff some variant exists with options[P] === V AND options[Q] ===
   * currentlySelected[Q] for every other position Q AND that variant is
   * available.
   *
   * Described Format/Size cards skip combination checks on Format (so Digital
   * vs poster stays clickable) and never draw strikethroughs. A leftover
   * Shopify Frame Finish option stays hidden and is not a cart variant.
   */
  recomputeAvailability() {
    const variants = this.#readAllVariants();
    if (!variants || variants.length === 0) return;

    const fieldsets = /** @type {HTMLFieldSetElement[]} */ (this.refs.fieldsets || []);
    if (fieldsets.length === 0) return;

    const described = this.#isDescribedPicker();

    // Collect the currently-selected value (string) at each option position.
    /** @type {(string | null)[]} */
    const selectedByPosition = fieldsets.map((fieldset) => {
      const checked = fieldset.querySelector('input:checked');
      return checked instanceof HTMLInputElement ? checked.value : null;
    });

    fieldsets.forEach((fieldset, fieldsetIndex) => {
      const lockOtherAxes =
        !described ||
        fieldset.classList.contains('variant-option--size') ||
        fieldset.classList.contains('variant-option--finish-native');
      const inputs = fieldset.querySelectorAll('input');
      inputs.forEach((input) => {
        const isAvailable = variants.some((variant) => {
          if (!variant.available) return false;
          if (variant.options[fieldsetIndex] !== input.value) return false;
          if (lockOtherAxes) {
            for (let i = 0; i < selectedByPosition.length; i++) {
              if (i === fieldsetIndex) continue;
              const sel = selectedByPosition[i];
              if (sel != null && variant.options[i] !== sel) return false;
            }
          }
          return true;
        });
        this.#applyAvailability(input, isAvailable, { strikethrough: !described });
      });
    });

    if (described) {
      this.#syncDescribedAxesVisibility();
      this.#updateDescribedFormatPrices();
    }
  }

  /**
   * Format cards always show the lowest price for that format, not the
   * currently selected size/variant. Shopify's option_value.variant is the
   * current combo, so every card can land on the same price without this.
   */
  #updateDescribedFormatPrices() {
    const variants = this.#readAllVariants();
    if (!variants?.length) return;

    const fieldsets = /** @type {HTMLFieldSetElement[]} */ (this.refs.fieldsets || []);
    const formatFieldset = fieldsets.find(
      (fieldset) =>
        fieldset.classList.contains('variant-option--format') || fieldset.classList.contains('variant-option--cards')
    );
    if (!formatFieldset) return;

    const normalize = (value) => String(value || '').trim().toLowerCase();

    formatFieldset.querySelectorAll('input').forEach((input) => {
      if (!(input instanceof HTMLInputElement)) return;

      const inputValue = input.value;
      const inputHandle = input.dataset.optionHandle || '';
      const matches = variants.filter((variant) =>
        variant.options.some((option) => {
          const value = String(option || '');
          return value === inputValue || normalize(value) === normalize(inputValue) || value.toLowerCase().replace(/[^a-z0-9]+/g, '-') === inputHandle;
        })
      );
      if (matches.length === 0) return;

      const available = matches.filter((variant) => variant.available);
      const pool = available.length > 0 ? available : matches;
      const chosen = pool.reduce((lowest, variant) =>
        (variant.price ?? Number.POSITIVE_INFINITY) < (lowest.price ?? Number.POSITIVE_INFINITY) ? variant : lowest
      );
      if (!chosen?.price_label) return;

      const label = input.closest('label');
      const row = label?.querySelector('.variant-option__card-row');
      if (!row) return;

      let priceEl = row.querySelector('.variant-option__card-price');
      if (!priceEl) {
        priceEl = document.createElement('span');
        priceEl.className = 'variant-option__card-price';
        row.appendChild(priceEl);
      }
      priceEl.textContent = chosen.price_label;
    });
  }

  /**
   * @returns {Array<{id: number, available: boolean, options: string[], price?: number, price_label?: string}> | null}
   */
  #readAllVariants() {
    const script = this.querySelector('script[type="application/json"][data-all-variants]');
    if (!script || !script.textContent) return null;
    try {
      return JSON.parse(script.textContent);
    } catch {
      return null;
    }
  }

  /**
   * @param {HTMLInputElement} input
   * @param {boolean} isAvailable
   * @param {{ strikethrough?: boolean }} [options]
   */
  #applyAvailability(input, isAvailable, { strikethrough = true } = {}) {
    input.dataset.optionAvailable = String(isAvailable);
    if (isAvailable) {
      input.removeAttribute('aria-disabled');
    } else {
      input.setAttribute('aria-disabled', 'true');
    }

    const label = input.closest('label');
    if (!label) return;

    const existingStrikethrough = label.querySelector('.variant-option__strikethrough');
    if (isAvailable || !strikethrough) {
      existingStrikethrough?.remove();
      return;
    }
    if (!existingStrikethrough) {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 100 46');
      svg.setAttribute('preserveAspectRatio', 'xMidYMid slice');
      svg.setAttribute('class', 'variant-option__strikethrough');
      svg.innerHTML =
        '<line x1="100" y1="0" x2="0" y2="46" vector-effect="non-scaling-stroke" />' +
        '<line x1="100" y1="0" x2="0" y2="46" vector-effect="non-scaling-stroke" />';
      label.appendChild(svg);
    }
  }

  updateVariantPickerCss() {
    const fieldsets = /** @type {HTMLFieldSetElement[]} */ (this.refs.fieldsets || []);

    // Batch all reads first across all fieldsets to avoid layout thrashing
    const measurements = fieldsets.map((_, index) => this.#getFieldsetMeasurements(index)).filter((m) => m !== null);

    // Batch all writes after all reads
    for (const measurement of measurements) {
      this.#applyFieldsetMeasurements(measurement);
    }
  }

  /**
   * Re-renders the desired element.
   * @param {Document} newHtml - The new HTML.
   * @param {string} elementSelector - The selector of the element to re-render.
   */
  updateElement(newHtml, elementSelector) {
    const element = this.closest(elementSelector);
    const newElement = newHtml.querySelector(elementSelector);

    if (!element || !newElement) {
      throw new Error(`No new element source found for ${elementSelector}`);
    }

    morph(element, newElement);
  }

  /**
   * Re-renders the entire main content.
   * @param {Document} newHtml - The new HTML.
   */
  updateMain(newHtml) {
    const main = document.querySelector('main');
    const newMain = newHtml.querySelector('main');

    if (!main || !newMain) {
      throw new Error('No new main source found');
    }

    morph(main, newMain);
  }

  /**
   * Gets the selected option.
   * @returns {HTMLInputElement | HTMLOptionElement | undefined} The selected option.
   */
  get selectedOption() {
    const selectedOption = this.querySelector('select option[selected], fieldset input:checked');

    if (!(selectedOption instanceof HTMLInputElement || selectedOption instanceof HTMLOptionElement)) {
      return undefined;
    }

    return selectedOption;
  }

  /**
   * Gets all the selected options.
   * @returns {{name: string, value: string}[]} All the currently selected options.
   */
  getAllSelectedOptions() {
    /** @type {{name: string, value: string}[]} */
    const options = [];

    // For <select> elements, use .selectedOptions to get the current selection
    // (the [selected] HTML attribute only reflects the initial state, not user changes)
    for (const select of this.querySelectorAll('select')) {
      const selected = select.selectedOptions[0];
      if (selected?.dataset?.optionName) {
        options.push({ name: selected.dataset.optionName, value: selected.value });
      }
    }

    // For radio/checkbox fieldsets, :checked reflects the current state
    /** @type {NodeListOf<HTMLInputElement>} */
    const checkedInputs = this.querySelectorAll('fieldset input:checked');
    for (const input of checkedInputs) {
      if (input.dataset?.optionName) {
        options.push({ name: input.dataset.optionName, value: input.value });
      }
    }

    return options;
  }

  /**
   * Gets the selected option ID.
   * @returns {string | undefined} The selected option ID.
   */
  get selectedOptionId() {
    const { selectedOption } = this;
    if (!selectedOption) return undefined;
    const { optionValueId } = selectedOption.dataset;

    if (!optionValueId) {
      throw new Error('No option value ID found');
    }

    return optionValueId;
  }

  /**
   * Gets the selected options values.
   * @returns {string[]} The selected options values.
   */
  get selectedOptionsValues() {
    /** @type HTMLElement[] */
    const selectedOptions = Array.from(this.querySelectorAll('select option[selected], fieldset input:checked'));

    return selectedOptions.map((option) => {
      const { optionValueId } = option.dataset;

      if (!optionValueId) throw new Error('No option value ID found');

      return optionValueId;
    });
  }
}

if (!customElements.get('variant-picker')) {
  customElements.define('variant-picker', VariantPicker);
}
