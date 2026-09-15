import { Component } from '@theme/component';

/**
 * Trust strip section with mobile scroll-snap carousel and dots.
 *
 * @typedef {object} Refs
 * @property {HTMLElement} track
 * @property {HTMLElement} [dots]
 *
 * @extends {Component<Refs>}
 */
class TrustStripComponent extends Component {
  requiredRefs = ['track'];

  /** @type {IntersectionObserver | null} */
  #observer = null;

  /** @type {number} */
  #activeIndex = 0;

  connectedCallback() {
    super.connectedCallback();
    this.#setupCarousel();
  }

  disconnectedCallback() {
    this.#observer?.disconnect();
    this.#observer = null;
    super.disconnectedCallback();
  }

  #setupCarousel() {
    const { track, dots } = this.refs;
    if (!track || !dots) return;

    const cards = Array.from(track.querySelectorAll('[data-trust-item]'));
    const buttons = Array.from(dots.querySelectorAll('.trust-strip__dot'));
    if (cards.length === 0 || buttons.length === 0) return;

    buttons.forEach((button, index) => {
      button.addEventListener('click', () => this.#goTo(index));
    });

    this.#observer?.disconnect();
    this.#observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (!visible?.target) return;
        const index = cards.indexOf(/** @type {Element} */ (visible.target));
        if (index >= 0) this.#setActive(index);
      },
      {
        root: track,
        threshold: [0.55, 0.75],
      }
    );

    cards.forEach((card) => this.#observer?.observe(card));
  }

  /**
   * @param {number} index
   */
  #goTo(index) {
    const { track } = this.refs;
    if (!track) return;
    const card = track.querySelectorAll('[data-trust-item]')[index];
    if (!(card instanceof HTMLElement)) return;
    card.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' });
    this.#setActive(index);
  }

  /**
   * @param {number} index
   */
  #setActive(index) {
    if (this.#activeIndex === index) return;
    this.#activeIndex = index;
    const { dots } = this.refs;
    if (!dots) return;
    dots.querySelectorAll('.trust-strip__dot').forEach((dot, i) => {
      dot.setAttribute('aria-current', i === index ? 'true' : 'false');
    });
  }
}

if (!customElements.get('trust-strip-component')) {
  customElements.define('trust-strip-component', TrustStripComponent);
}
