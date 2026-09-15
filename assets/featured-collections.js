import { Component } from '@theme/component';

/**
 * Featured collections section with category filter pills.
 *
 * @typedef {object} Refs
 * @property {HTMLElement} filters
 * @property {HTMLElement} grid
 *
 * @extends {Component<Refs>}
 */
class FeaturedCollectionsComponent extends Component {
  requiredRefs = ['filters', 'grid'];

  connectedCallback() {
    super.connectedCallback();
    this.#bindFilters();
  }

  #bindFilters() {
    const { filters } = this.refs;
    if (!filters) return;

    filters.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const button = target.closest('[data-filter]');
      if (!(button instanceof HTMLButtonElement)) return;
      this.#activate(button.dataset.filter || 'all', button);
    });
  }

  /**
   * @param {string} filter
   * @param {HTMLButtonElement} activeButton
   */
  #activate(filter, activeButton) {
    const { filters, grid } = this.refs;
    if (!filters || !grid) return;

    filters.querySelectorAll('[data-filter]').forEach((button) => {
      const isActive = button === activeButton;
      button.classList.toggle('is-active', isActive);
      button.setAttribute('aria-pressed', String(isActive));
    });

    const normalized = filter.trim().toLowerCase();
    const showAll = normalized === 'all' || normalized === '';

    grid.querySelectorAll('[data-category]').forEach((card) => {
      if (!(card instanceof HTMLElement)) return;
      const categories = (card.dataset.category || '')
        .split(',')
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean);
      const match = showAll || categories.length === 0 || categories.includes(normalized);
      card.toggleAttribute('hidden', !match);
      card.classList.toggle('is-filtered-out', !match);
    });
  }
}

if (!customElements.get('featured-collections-component')) {
  customElements.define('featured-collections-component', FeaturedCollectionsComponent);
}
