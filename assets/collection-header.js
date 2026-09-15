import { Component } from '@theme/component';

/**
 * Collection header with expandable description.
 */
class CollectionHeaderComponent extends Component {
  connectedCallback() {
    super.connectedCallback();

    this.#learnMoreButton = this.querySelector('[data-learn-more]');
    this.#description = this.querySelector('[data-description]');
    this.#preview = this.querySelector('[data-description-preview]');
    this.#full = this.querySelector('[data-description-full]');
    this.#learnMoreLabel = this.querySelector('[data-learn-more-label]');
    this.#showLessLabel = this.querySelector('[data-show-less-label]');

    if (this.#learnMoreLabel && !this.#learnMoreLabel.dataset.defaultLabel) {
      this.#learnMoreLabel.dataset.defaultLabel = this.#learnMoreLabel.textContent?.trim() || 'Learn more';
    }

    this.#learnMoreButton?.addEventListener('click', this.#toggleDescription);
  }

  disconnectedCallback() {
    this.#learnMoreButton?.removeEventListener('click', this.#toggleDescription);
    super.disconnectedCallback();
  }

  /** @type {HTMLButtonElement | null} */
  #learnMoreButton = null;
  /** @type {HTMLElement | null} */
  #description = null;
  /** @type {HTMLElement | null} */
  #preview = null;
  /** @type {HTMLElement | null} */
  #full = null;
  /** @type {HTMLElement | null} */
  #learnMoreLabel = null;
  /** @type {HTMLElement | null} */
  #showLessLabel = null;

  #toggleDescription = () => {
    const expanded = this.getAttribute('data-expanded') === 'true';
    const next = !expanded;

    this.setAttribute('data-expanded', String(next));
    this.#description?.setAttribute('data-open', String(next));
    this.#learnMoreButton?.setAttribute('aria-expanded', String(next));

    if (this.#full) this.#full.hidden = !next;
    if (this.#preview && this.#full) this.#preview.hidden = next;

    if (this.#learnMoreLabel) {
      this.#learnMoreLabel.textContent = next
        ? this.#showLessLabel?.textContent?.trim() || 'Show less'
        : this.#learnMoreLabel.dataset.defaultLabel || 'Learn more';
    }
  };
}

if (!customElements.get('collection-header-component')) {
  customElements.define('collection-header-component', CollectionHeaderComponent);
}
