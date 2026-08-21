class PdpBuyNow extends HTMLElement {
  connectedCallback() {
    this.button = this.querySelector('button');
    this.button?.addEventListener('click', this.onClick);
  }

  disconnectedCallback() {
    this.button?.removeEventListener('click', this.onClick);
  }

  onClick = async (event) => {
    event.preventDefault();
    const form = this.closest('form');
    if (!form || this.button?.disabled) return;

    this.button.disabled = true;

    const productId = this.dataset.productId || form.closest('product-form-component')?.dataset.productId;
    const picker = productId
      ? document.querySelector(`variant-picker[data-product-id="${productId}"]`)
      : document.querySelector('variant-picker');
    const resolved = picker?.getSelectedVariant?.();
    const variantId =
      (resolved?.id != null ? String(resolved.id) : '') ||
      form.querySelector('input[name="id"]')?.value;
    if (!variantId) {
      this.button.disabled = false;
      return;
    }

    const quantityInput = form.querySelector('input[name="quantity"]');
    const quantity = quantityInput?.value || '1';
    const formData = new FormData();
    formData.set('id', variantId);
    formData.set('quantity', quantity);

    if (picker?.classList?.contains('is-framed-format')) {
      const finish = picker.querySelector('[data-frame-finish-property] input:checked');
      if (finish instanceof HTMLInputElement && finish.value) {
        formData.set('properties[Frame Finish]', finish.value);
      }
    }

    const addUrl = this.dataset.addUrl?.endsWith('.js')
      ? this.dataset.addUrl
      : `${this.dataset.addUrl || '/cart/add'}.js`;
    const checkoutUrl = this.dataset.checkoutUrl || '/checkout';

    try {
      const response = await fetch(addUrl, {
        method: 'POST',
        headers: { Accept: 'application/json' },
        body: formData,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.status) {
        throw new Error(data.message || 'Add to cart failed');
      }
      window.location.href = checkoutUrl;
    } catch (error) {
      console.warn('[PDP Buy now]', error);
      this.button.disabled = false;
    }
  };
}

if (!customElements.get('pdp-buy-now')) {
  customElements.define('pdp-buy-now', PdpBuyNow);
}
