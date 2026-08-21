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

  /** @type {string} */
  #describedFormatValue = '';

  /** @type {string} */
  #describedSizeValue = '';

  /** @type {number} */
  #pairSizeTimer = 0;

  /** When true, next size pairings pick Small (first print size), not a leftover Medium. */
  #preferDefaultSize = false;

  #resizeObserver = new ResizeNotifier(() => this.updateVariantPickerCss());

  /** @type {(event: Event) => void} */
  #onVariantChange = (event) => this.variantChanged(event);

  /** @type {(event: Event) => void} */
  #onVariantClick = (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const input = target instanceof HTMLInputElement ? target : target.closest('label')?.querySelector('input');
    if (!(input instanceof HTMLInputElement)) return;
    if (input.name?.startsWith('properties')) return;
    this.#debug('click before change?', {
      value: input.value,
      handle: input.dataset.optionHandle,
      checkedBefore: input.checked,
      name: input.name,
    });
  };

  /**
   * PDP debug — uses console.warn so it still shows when DevTools hides Info/Verbose.
   * Filter by `PDP picker`. Turn off: window.__PDP_PICKER_DEBUG = false
   * @param {string} label
   * @param {Record<string, unknown>} [data]
   */
  #debug(label, data = {}) {
    if (window.__PDP_PICKER_DEBUG === false) return;
    let snapshot = null;
    try {
      snapshot = this.#debugSnapshot();
    } catch (error) {
      snapshot = { snapshotError: String(error) };
    }
    console.warn(`[PDP picker] ${label}`, data, snapshot);
  }

  /** @returns {Record<string, unknown>} */
  #debugSnapshot() {
    const formatFieldset = this.#getFormatFieldset();
    const sizeFieldset = this.#getSizeFieldset();
    const finish = this.#getFrameFinishProperty();
    const format = this.#getSelectedFormatInput();
    const sizeInputs = sizeFieldset
      ? Array.from(sizeFieldset.querySelectorAll('input')).filter((input) => input instanceof HTMLInputElement)
      : [];
    const formatInputs = formatFieldset
      ? Array.from(formatFieldset.querySelectorAll('input')).filter((input) => input instanceof HTMLInputElement)
      : [];

    return {
      described: this.#isDescribedPicker(),
      classes: [...this.classList],
      formatFieldset: formatFieldset
        ? { className: formatFieldset.className, axis: formatFieldset.dataset.axis }
        : null,
      formatRadios: formatInputs.map((input) => ({
        value: input.value,
        handle: input.dataset.optionHandle,
        kind: input.dataset.formatKind,
        checked: input.checked,
        currentChecked: input.dataset.currentChecked,
      })),
      selectedFormat: format
        ? {
            value: format.value,
            handle: format.dataset.optionHandle,
            kind: format.dataset.formatKind,
            digital: this.#isDigitalOption(format),
            framed: this.#isFramedFormat(format),
          }
        : null,
      sizeFieldset: sizeFieldset
        ? { className: sizeFieldset.className, axis: sizeFieldset.dataset.axis }
        : null,
      sizeRadios: sizeInputs.map((input) => ({
        value: input.value,
        handle: input.dataset.optionHandle,
        kind: input.dataset.sizeKind,
        checked: input.checked,
        disabled: input.disabled,
        currentChecked: input.dataset.currentChecked,
        labelHidden: Boolean(input.closest('label')?.hidden),
      })),
      sizeChecked: sizeInputs.find((input) => input.checked)?.value ?? null,
      frameFinish: finish
        ? {
            hiddenAttr: finish.hasAttribute('hidden'),
            display: getComputedStyle(finish).display,
            disabled: Array.from(finish.querySelectorAll('input')).map((input) => ({
              value: input.value,
              disabled: input.disabled,
              checked: input.checked,
            })),
          }
        : 'NOT IN DOM',
      remembered: {
        format: this.#describedFormatValue,
        size: this.#describedSizeValue,
        finish: this.#frameFinishValue,
      },
    };
  }

  connectedCallback() {
    console.warn('[PDP picker] connectedCallback start', {
      described: this.classList.contains('variant-picker--described'),
      productId: this.dataset.productId,
    });
    super.connectedCallback();
    this.#radios = [];
    this.#checkedIndices = [];
    const fieldsets = /** @type {HTMLFieldSetElement[]} */ (this.refs.fieldsets || []);

    fieldsets.forEach((fieldset) => {
      const radios = Array.from(fieldset?.querySelectorAll('input') ?? []);
      this.#radios.push(radios);

      const initialCheckedIndex = radios.findIndex((radio) => radio.dataset.currentChecked === 'true');
      if (initialCheckedIndex !== -1) {
        this.#checkedIndices.push([initialCheckedIndex]);
      }
    });

    this.removeEventListener('change', this.#onVariantChange);
    this.removeEventListener('click', this.#onVariantClick, true);
    this.addEventListener('change', this.#onVariantChange);
    this.addEventListener('click', this.#onVariantClick, true);
    this.#resizeObserver.observe(this);
    try {
      this.recomputeAvailability();
      this.#syncDescribedAxesVisibility();
      this.#pairSizeToFormat();
    } catch (error) {
      console.error('[PDP picker] connected setup threw — listener is still attached', error);
    }
    this.#debug('connected');
    window.__PDP_PICKER = this;
  }

  updatedCallback() {
    super.updatedCallback();
    this.#refreshRadioCaches();
    this.#schedulePairSizeToFormat();
    this.#debug('updatedCallback');
  }

  disconnectedCallback() {
    this.removeEventListener('change', this.#onVariantChange);
    this.removeEventListener('click', this.#onVariantClick, true);
    super.disconnectedCallback();
    this.#resizeObserver.disconnect();
    window.clearTimeout(this.#pairSizeTimer);
  }

  /**
   * Handles the variant change event.
   * @param {Event} event - The variant change event.
   */
  variantChanged(event) {
    if (!(event.target instanceof HTMLElement)) return;

    if (event.target instanceof HTMLInputElement && event.target.name.startsWith('properties')) {
      this.#captureFrameFinish();
      this.#debug('change: frame finish property', { value: event.target.value });
      return;
    }

    const selectedOption =
      event.target instanceof HTMLSelectElement ? event.target.options[event.target.selectedIndex] : event.target;

    if (!selectedOption) return;

    this.#debug('change', {
      tag: event.target.tagName,
      name: event.target instanceof HTMLInputElement ? event.target.name : '',
      value: event.target instanceof HTMLInputElement ? event.target.value : selectedOption.textContent,
      handle: event.target instanceof HTMLElement ? event.target.dataset.optionHandle : '',
    });

    this.updateSelectedOption(event.target);
    try {
      if (event.target instanceof HTMLInputElement) {
        this.#reconcileDescribedSelection(event.target);
        this.#syncDescribedAxesVisibility(event.target);
        this.#schedulePairSizeToFormat(event.target);
      } else {
        this.#syncDescribedAxesVisibility();
        this.#schedulePairSizeToFormat();
      }
    } catch (error) {
      console.error('[PDP picker] variantChanged threw', error);
      this.#schedulePairSizeToFormat(event.target instanceof HTMLInputElement ? event.target : null);
    }
    this.#captureDescribedSelection();
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
      const liveFieldset = target.closest('fieldset');
      if (liveFieldset) {
        liveFieldset.querySelectorAll('input[type="radio"]').forEach((input) => {
          if (!(input instanceof HTMLInputElement)) return;
          input.dataset.currentChecked = input === target ? 'true' : 'false';
        });
      }
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

        this.#schedulePairSizeToFormat();

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

    this.#captureDescribedSelection();

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
    this.#restoreDescribedSelection();
    this.recomputeAvailability();
    this.#syncDescribedAxesVisibility();
    this.#schedulePairSizeToFormat();
    this.#debug('after morph');

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
   * Shopify option position (0-based) for a picker fieldset, from data-input-id.
   * Fieldset index can differ when a leftover Frame Finish option sits in between.
   * @param {HTMLFieldSetElement} fieldset
   * @returns {number | null}
   */
  #shopifyOptionIndex(fieldset) {
    const input = fieldset.querySelector('input[data-input-id]');
    if (!(input instanceof HTMLInputElement)) return null;
    const position = Number.parseInt((input.dataset.inputId || '').split('-')[0] || '', 10);
    return Number.isNaN(position) ? null : position - 1;
  }

  /** @returns {HTMLFieldSetElement[]} */
  #optionFieldsets() {
    return Array.from(this.querySelectorAll('fieldset.variant-option[data-fieldset-index]'));
  }

  /**
   * @param {string | null | undefined} left
   * @param {string | null | undefined} right
   */
  #sameOptionValue(left, right) {
    return String(left || '').trim().toLowerCase() === String(right || '').trim().toLowerCase();
  }

  #reconcileDescribedSelection(changedInput) {
    if (!this.#isDescribedPicker()) return;

    const variants = this.#readAllVariants();
    if (!variants?.length) return;

    const fieldsets = this.#optionFieldsets();
    const changedFieldset = changedInput.closest('fieldset');
    const changedShopifyIndex =
      changedFieldset instanceof HTMLFieldSetElement ? this.#shopifyOptionIndex(changedFieldset) : null;

    /** @type {(string | null)[]} */
    const selectedByShopifyIndex = [];
    fieldsets.forEach((fieldset) => {
      const shopifyIndex = this.#shopifyOptionIndex(fieldset);
      if (shopifyIndex == null) return;
      if (fieldset.contains(changedInput)) {
        selectedByShopifyIndex[shopifyIndex] = changedInput.value;
        return;
      }
      const checked = fieldset.querySelector('input:checked');
      selectedByShopifyIndex[shopifyIndex] = checked instanceof HTMLInputElement ? checked.value : null;
    });

    const matchesSelection = (/** @type {{options: string[]}} */ variant) =>
      variant.options.every((option, index) => {
        const selected = selectedByShopifyIndex[index];
        return selected == null || this.#sameOptionValue(option, selected);
      });

    const formatFieldset = this.#getFormatFieldset();
    const sizeFieldset = this.#getSizeFieldset();
    const formatShopifyIndex = formatFieldset ? this.#shopifyOptionIndex(formatFieldset) : null;
    const sizeShopifyIndex = sizeFieldset ? this.#shopifyOptionIndex(sizeFieldset) : null;
    const formatIsDigital = /digital/i.test(String(selectedByShopifyIndex[formatShopifyIndex ?? -1] ?? ''));
    const sizeIsDigital = /digital/i.test(String(selectedByShopifyIndex[sizeShopifyIndex ?? -1] ?? ''));
    const invalidDigitalPairing =
      formatShopifyIndex != null && sizeShopifyIndex != null && formatIsDigital !== sizeIsDigital;

    const exact = variants.find((variant) => variant.available && matchesSelection(variant));
    if (exact && !invalidDigitalPairing) {
      this.#syncDescribedAxesVisibility();
      return;
    }

    const changedValue = String(changedInput.value || '').trim().toLowerCase();
    const candidates = variants.filter((variant) => {
      if (!variant.available) return false;
      if (changedShopifyIndex != null) {
        return this.#sameOptionValue(variant.options[changedShopifyIndex], changedInput.value);
      }
      return variant.options.some((option) => String(option || '').trim().toLowerCase() === changedValue);
    });
    if (candidates.length === 0) return;

    const score = (/** @type {{options: string[]}} */ variant) => {
      let total = 0;
      variant.options.forEach((option, index) => {
        if (index === changedShopifyIndex) return;
        if (this.#sameOptionValue(option, selectedByShopifyIndex[index])) total += 10;
      });
      if (sizeShopifyIndex != null && changedShopifyIndex !== sizeShopifyIndex) {
        const sizeValue = variant.options[sizeShopifyIndex] || '';
        if (/digital/i.test(sizeValue)) total -= 20;
        else if (/small/i.test(sizeValue)) total += 3;
        else if (/medium/i.test(sizeValue)) total += 1;
      }
      return total;
    };

    candidates.sort((a, b) => score(b) - score(a));
    const best = candidates[0];
    if (!best) return;

    fieldsets.forEach((fieldset) => {
      if (fieldset.contains(changedInput)) return;
      const shopifyIndex = this.#shopifyOptionIndex(fieldset);
      if (shopifyIndex == null) return;
      const desired = best.options[shopifyIndex];
      const input = Array.from(fieldset.querySelectorAll('input')).find(
        (candidate) =>
          candidate instanceof HTMLInputElement &&
          (candidate.value === desired || this.#sameOptionValue(candidate.value, desired))
      );
      if (input instanceof HTMLInputElement) {
        this.#selectRadio(input);
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

    /** @type {(string | null)[]} */
    const selected = [];
    this.#optionFieldsets().forEach((fieldset) => {
      const shopifyIndex = this.#shopifyOptionIndex(fieldset);
      const checked = fieldset.querySelector('input:checked');
      if (shopifyIndex == null || !(checked instanceof HTMLInputElement)) return;
      selected[shopifyIndex] = checked.value;
    });

    return (
      variants.find((variant) =>
        variant.options.every((option, index) => selected[index] == null || this.#sameOptionValue(option, selected[index]))
      ) ?? null
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
    if (input.dataset.formatKind === 'digital' || input.dataset.sizeKind === 'digital') return true;
    const handle = (input.dataset.optionHandle || '').toLowerCase();
    const value = (input.value || '').toLowerCase();
    return handle.includes('digital') || value.includes('digital');
  }

  /** @param {Element | null} input */
  #isFramedFormat(input) {
    if (!(input instanceof HTMLInputElement)) return false;
    if (input.dataset.formatKind === 'framed') return true;
    const handle = (input.dataset.optionHandle || '').toLowerCase();
    const value = (input.value || '').toLowerCase();
    const haystack = `${handle} ${value}`;
    if (haystack.includes('digital') || haystack.includes('unframed') || haystack.includes('no-frame')) {
      return false;
    }
    if (haystack.includes('framed')) return true;
    return haystack.includes('frame') && haystack.includes('canvas');
  }

  /** @returns {HTMLFieldSetElement | null} */
  #getFormatFieldset() {
    const byClass = this.querySelector('fieldset.variant-option--format');
    if (byClass instanceof HTMLFieldSetElement) return byClass;

    return (
      this.#optionFieldsets().find((fieldset) => {
        if (fieldset.classList.contains('variant-option--size')) return false;
        if (fieldset.classList.contains('variant-option--finish-native')) return false;
        return Array.from(fieldset.querySelectorAll('input')).some((input) => {
          if (!(input instanceof HTMLInputElement)) return false;
          const handle = input.dataset.optionHandle || '';
          return (
            handle.includes('digital-download') ||
            handle.includes('poster') ||
            handle.includes('giclee') ||
            handle.includes('canvas')
          );
        });
      }) ?? null
    );
  }

  /** @returns {HTMLInputElement | null} */
  #getSelectedFormatInput() {
    const fieldset = this.#getFormatFieldset();
    if (!fieldset) return null;
    const checked =
      fieldset.querySelector('input:checked') || fieldset.querySelector('[data-current-checked="true"]');
    return checked instanceof HTMLInputElement ? checked : null;
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

  #captureDescribedSelection() {
    const format = this.#getSelectedFormatInput();
    if (format) this.#describedFormatValue = format.value;
    const size = this.#getSizeFieldset()?.querySelector('input:checked');
    if (size instanceof HTMLInputElement) this.#describedSizeValue = size.value;
    this.#captureFrameFinish();
  }

  /** @returns {HTMLFieldSetElement | null} */
  #getSizeFieldset() {
    const byClass = this.querySelector('fieldset.variant-option--size, fieldset[data-axis="size"]');
    if (byClass instanceof HTMLFieldSetElement) return byClass;

    return (
      this.#optionFieldsets().find((fieldset) => {
        if (fieldset.classList.contains('variant-option--format')) return false;
        if (fieldset.classList.contains('variant-option--finish-native')) return false;
        return Array.from(fieldset.querySelectorAll('input')).some((input) => {
          if (!(input instanceof HTMLInputElement)) return false;
          if (input.dataset.sizeKind) return true;
          const haystack = `${input.dataset.optionHandle || ''} ${input.value || ''}`;
          return /digital-file|small|medium|large/i.test(haystack);
        });
      }) ?? null
    );
  }

  /**
   * Force a radio on, including the HTML checked attribute, so morph + CSS :has(:checked)
   * stay in sync with the intended selection.
   *
   * Never disable a radio in the group first: a checked+disabled radio keeps
   * ownership of the group, and browsers then ignore `.checked = true` on siblings.
   * @param {HTMLInputElement} input
   */
  #selectRadio(input) {
    const fieldset = input.closest('fieldset');
    const radios = (
      fieldset ? Array.from(fieldset.querySelectorAll('input')) : [input]
    ).filter((candidate) => candidate instanceof HTMLInputElement);

    radios.forEach((candidate) => {
      candidate.disabled = false;
    });

    radios.forEach((candidate) => {
      const on = candidate === input;
      candidate.checked = on;
      if (on) {
        candidate.setAttribute('checked', 'checked');
      } else {
        candidate.removeAttribute('checked');
      }
      candidate.dataset.currentChecked = on ? 'true' : 'false';
    });

    input.disabled = false;
    input.checked = true;
    input.setAttribute('checked', 'checked');
    input.dataset.currentChecked = 'true';
    this.updateSelectedOption(input);

    if (!input.checked) {
      console.warn('[PDP picker] selectRadio FAILED to check', {
        value: input.value,
        handle: input.dataset.optionHandle,
        disabled: input.disabled,
        name: input.name,
        fieldsetClass: fieldset?.className,
      });
    }
  }

  #restoreDescribedSelection() {
    const formatFieldset = this.#getFormatFieldset();
    if (formatFieldset && this.#describedFormatValue) {
      const formatInput = Array.from(formatFieldset.querySelectorAll('input')).find(
        (input) => input instanceof HTMLInputElement && this.#sameOptionValue(input.value, this.#describedFormatValue)
      );
      if (formatInput instanceof HTMLInputElement) {
        this.#selectRadio(formatInput);
      }
    }
    this.#restoreFrameFinish();
  }

  #schedulePairSizeToFormat(preferredFormatInput = null) {
    if (preferredFormatInput instanceof HTMLInputElement && this.#getFormatFieldset()?.contains(preferredFormatInput)) {
      this.#describedFormatValue = preferredFormatInput.value;
      this.#preferDefaultSize = true;
    }

    this.#debug('schedule pair', {
      preferred: preferredFormatInput?.value ?? null,
      preferDefaultSize: this.#preferDefaultSize,
    });
    this.#pairSizeToFormat(preferredFormatInput);
    window.clearTimeout(this.#pairSizeTimer);
    const rerun = (reason) => {
      this.#debug(`pair rerun (${reason})`);
      this.#restoreDescribedSelection();
      this.#pairSizeToFormat();
      const format = this.#getSelectedFormatInput();
      this.#syncFrameFinishProperty(this.#isFramedFormat(format) && !this.#isDigitalOption(format));
    };
    requestAnimationFrame(() => rerun('rAF'));
    this.#pairSizeTimer = window.setTimeout(() => {
      rerun('400ms');
      this.#preferDefaultSize = false;
    }, 400);
  }

  #ensureSelectedSize(formatIsDigital, formatValue) {
    this.#pairSizeToFormat(null, formatIsDigital, formatValue);
  }

  /**
   * Always leave exactly one usable size checked. Digital Download pairs with
   * Digital file; every other format pairs with the first print size.
   * @param {Element | null} [preferredFormatInput]
   * @param {boolean} [formatIsDigital]
   * @param {string} [formatValue]
   */
  #pairSizeToFormat(preferredFormatInput = null, formatIsDigital, formatValue) {
    const sizeFieldset = this.#getSizeFieldset();
    if (!(sizeFieldset instanceof HTMLFieldSetElement)) {
      this.#debug('pairSize BAIL: no size fieldset', {
        preferred: preferredFormatInput instanceof HTMLInputElement ? preferredFormatInput.value : null,
      });
      return;
    }

    const formatFieldset = this.#getFormatFieldset();
    const formatInput =
      preferredFormatInput instanceof HTMLInputElement && formatFieldset?.contains(preferredFormatInput)
        ? preferredFormatInput
        : this.#getSelectedFormatInput();

    const digitalFormat = formatIsDigital ?? this.#isDigitalOption(formatInput);
    const formatName = formatValue ?? formatInput?.value ?? '';
    const radios = Array.from(sizeFieldset.querySelectorAll('input')).filter(
      (input) => input instanceof HTMLInputElement
    );

    // Keep every size radio enabled. CSS hides Digital file vs print sizes.
    // Disabling the still-checked Digital file radio is what blocked Small
    // from becoming :checked when switching to a print format.
    radios.forEach((radio) => {
      radio.disabled = false;
    });

    const usableRadios = radios.filter((radio) =>
      digitalFormat ? this.#isDigitalOption(radio) : !this.#isDigitalOption(radio)
    );
    const available = formatName
      ? usableRadios.filter((radio) => this.#sizeAvailableForFormat(radio, formatName))
      : usableRadios;
    const pool = available.length > 0 ? available : usableRadios;
    const defaultSize =
      pool.find((radio) => /small/i.test(`${radio.dataset.optionHandle || ''} ${radio.value}`)) ?? pool[0];
    const checkedUsable = pool.find((radio) => radio.checked);
    const formatJustChanged =
      preferredFormatInput instanceof HTMLInputElement && Boolean(formatFieldset?.contains(preferredFormatInput));
    const selected =
      this.#preferDefaultSize || formatJustChanged || !checkedUsable ? defaultSize : checkedUsable;
    if (!(selected instanceof HTMLInputElement)) {
      this.#debug('pairSize BAIL: no usable size radio', {
        digitalFormat,
        formatName,
        radioCount: radios.length,
        usable: usableRadios.map((radio) => radio.value),
        available: available.map((radio) => radio.value),
      });
      return;
    }

    this.#selectRadio(selected);
    this.#describedSizeValue = selected.value;
    const actuallyChecked = sizeFieldset.querySelector('input:checked');
    this.#debug('pairSize applied', {
      digitalFormat,
      formatName,
      preferDefaultSize: this.#preferDefaultSize,
      formatJustChanged,
      wanted: selected.value,
      actuallyChecked: actuallyChecked instanceof HTMLInputElement ? actuallyChecked.value : null,
      checkStuck: actuallyChecked !== selected,
      pool: pool.map((radio) => radio.value),
    });
  }

  #syncFrameFinishProperty(showFinish) {
    const fieldset = this.#getFrameFinishProperty();
    if (!fieldset) {
      this.#debug('frame finish BAIL: fieldset missing', { showFinish });
      return;
    }

    // Visibility is CSS :has() / .is-framed-format. Do not use [hidden] —
    // the UA stylesheet's display:none !important survives author CSS and
    // Shopify morph puts the attribute back from server HTML.
    fieldset.removeAttribute('hidden');
    const inputs = Array.from(fieldset.querySelectorAll('input')).filter(
      (input) => input instanceof HTMLInputElement
    );

    inputs.forEach((input) => {
      input.disabled = !showFinish;
    });

    if (!showFinish) {
      this.#debug('frame finish hide', {
        pickerHasFramedClass: this.classList.contains('is-framed-format'),
        display: getComputedStyle(fieldset).display,
      });
      return;
    }

    const selected =
      inputs.find((input) => input.value === this.#frameFinishValue) ??
      inputs.find((input) => input.checked) ??
      inputs[0];
    if (selected) {
      selected.checked = true;
      selected.disabled = false;
      this.#frameFinishValue = selected.value;
    }
    this.#debug('frame finish show', {
      selected: selected?.value ?? null,
      display: getComputedStyle(fieldset).display,
      pickerHasFramedClass: this.classList.contains('is-framed-format'),
    });
  }

  #sizeAvailableForFormat(sizeInput, formatValue) {
    const variants = this.#readAllVariants();
    if (!variants?.length) return !this.#isDigitalOption(sizeInput);

    return variants.some((variant) => {
      if (!variant.available) return false;
      const hasFormat = variant.options.some((option) => this.#sameOptionValue(option, formatValue));
      const hasSize = variant.options.some((option) => this.#sameOptionValue(option, sizeInput.value));
      return hasFormat && hasSize;
    });
  }

  #syncSizeChoices(formatIsDigital, formatValue) {
    const sizeFieldset = this.#getSizeFieldset();
    if (!(sizeFieldset instanceof HTMLFieldSetElement)) return;

    const labels = Array.from(sizeFieldset.querySelectorAll('.variant-option__button-label'));
    let shownPhysical = 0;

    labels.forEach((label) => {
      const input = label.querySelector('input');
      if (!(input instanceof HTMLInputElement)) return;
      const isDigital = this.#isDigitalOption(input);
      let show = formatIsDigital ? isDigital : !isDigital && this.#sizeAvailableForFormat(input, formatValue);
      if (show && !isDigital) shownPhysical += 1;
      label.toggleAttribute('hidden', !show);
    });

    if (!formatIsDigital && shownPhysical === 0) {
      labels.forEach((label) => {
        const input = label.querySelector('input');
        if (!(input instanceof HTMLInputElement)) return;
        label.toggleAttribute('hidden', this.#isDigitalOption(input));
      });
    }
  }

  #syncDescribedAxesVisibility(preferredFormatInput = null) {
    if (!this.#isDescribedPicker()) {
      this.#debug('sync axes BAIL: not described picker');
      return;
    }

    const formatFieldset = this.#getFormatFieldset();
    const formatChecked =
      preferredFormatInput instanceof HTMLInputElement && formatFieldset?.contains(preferredFormatInput)
        ? preferredFormatInput
        : this.#getSelectedFormatInput();
    const formatValue = formatChecked?.value ?? '';
    const formatIsDigital = this.#isDigitalOption(formatChecked);
    const showFinish = this.#isFramedFormat(formatChecked) && !formatIsDigital;

    this.#debug('sync axes', {
      preferred: preferredFormatInput instanceof HTMLInputElement ? preferredFormatInput.value : null,
      formatValue,
      formatHandle: formatChecked?.dataset.optionHandle ?? null,
      formatKind: formatChecked?.dataset.formatKind ?? null,
      formatIsDigital,
      isFramed: this.#isFramedFormat(formatChecked),
      showFinish,
    });

    this.classList.toggle('is-digital-format', formatIsDigital);
    this.classList.toggle('is-framed-format', showFinish);

    this.querySelectorAll('fieldset.variant-option--size, fieldset[data-axis="size"]').forEach((fieldset) => {
      fieldset.removeAttribute('hidden');
    });
    this.#syncSizeChoices(formatIsDigital, formatValue);
    this.#ensureSelectedSize(formatIsDigital, formatValue);
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

    const fieldsets = this.#optionFieldsets();
    if (fieldsets.length === 0) return;

    const described = this.#isDescribedPicker();

    /** @type {(string | null)[]} */
    const selectedByShopifyIndex = [];
    fieldsets.forEach((fieldset) => {
      if (fieldset.classList.contains('variant-option--finish-native')) return;
      const shopifyIndex = this.#shopifyOptionIndex(fieldset);
      if (shopifyIndex == null) return;
      const checked = fieldset.querySelector('input:checked');
      selectedByShopifyIndex[shopifyIndex] = checked instanceof HTMLInputElement ? checked.value : null;
    });

    fieldsets.forEach((fieldset) => {
      if (fieldset.classList.contains('variant-option--finish-native')) return;
      const shopifyIndex = this.#shopifyOptionIndex(fieldset);
      if (shopifyIndex == null) return;

      const lockOtherAxes = !described || fieldset.classList.contains('variant-option--size');
      const inputs = fieldset.querySelectorAll('input');
      inputs.forEach((input) => {
        if (!(input instanceof HTMLInputElement)) return;
        const isAvailable = variants.some((variant) => {
          if (!variant.available) return false;
          if (!this.#sameOptionValue(variant.options[shopifyIndex], input.value)) return false;
          if (lockOtherAxes) {
            for (let i = 0; i < selectedByShopifyIndex.length; i++) {
              if (i === shopifyIndex) continue;
              const sel = selectedByShopifyIndex[i];
              if (sel != null && !this.#sameOptionValue(variant.options[i], sel)) return false;
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
    const selectedOption = this.querySelector(
      'select option[selected], fieldset input:checked[data-option-value-id]'
    );

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
    const selectedOptions = Array.from(
      this.querySelectorAll('select option[selected], fieldset input:checked')
    ).filter((option) => {
      if (!option.dataset.optionValueId) return false;
      if (option instanceof HTMLInputElement && option.name.startsWith('properties')) return false;
      return true;
    });

    return selectedOptions.map((option) => option.dataset.optionValueId);
  }
}

console.warn('[PDP picker] module evaluated', {
  alreadyDefined: Boolean(customElements.get('variant-picker')),
  href: typeof location !== 'undefined' ? location.pathname : '',
});

if (!customElements.get('variant-picker')) {
  customElements.define('variant-picker', VariantPicker);
  console.warn('[PDP picker] custom element defined');
} else {
  console.warn(
    '[PDP picker] custom element was ALREADY defined — this file’s new class may not be active until a hard refresh'
  );
}

/** Manual probe from DevTools: __PDP_PICKER_DUMP() */
window.__PDP_PICKER_DUMP = () => {
  const picker = document.querySelector('variant-picker');
  console.warn('[PDP picker] dump', {
    found: Boolean(picker),
    isInstance: picker instanceof VariantPicker,
    className: picker?.className,
    listenersGuess: 'check click then change logs after selecting a format',
  });
  return picker;
};
