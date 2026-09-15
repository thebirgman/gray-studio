class CartDrawerBestsellers extends HTMLElement {
  /** @type {HTMLElement | null} */
  #scroller = null;

  connectedCallback() {
    this.#scroller = this.querySelector('[data-bestsellers-scroller]');
    this.querySelector('[data-bestsellers-prev]')?.addEventListener('click', this.#scrollPrev);
    this.querySelector('[data-bestsellers-next]')?.addEventListener('click', this.#scrollNext);
  }

  disconnectedCallback() {
    this.querySelector('[data-bestsellers-prev]')?.removeEventListener('click', this.#scrollPrev);
    this.querySelector('[data-bestsellers-next]')?.removeEventListener('click', this.#scrollNext);
  }

  /** @returns {number} */
  #scrollAmount() {
    const card = this.#scroller?.querySelector('.cart-drawer-card');
    if (!(card instanceof HTMLElement)) return 250;
    const styles = this.#scroller ? getComputedStyle(this.#scroller) : null;
    const gap = styles ? Number.parseFloat(styles.columnGap || styles.gap) || 10 : 10;
    return card.getBoundingClientRect().width + gap;
  }

  #scrollPrev = () => {
    this.#scroller?.scrollBy({ left: -this.#scrollAmount(), behavior: 'smooth' });
  };

  #scrollNext = () => {
    this.#scroller?.scrollBy({ left: this.#scrollAmount(), behavior: 'smooth' });
  };
}

if (!customElements.get('cart-drawer-bestsellers')) {
  customElements.define('cart-drawer-bestsellers', CartDrawerBestsellers);
}
