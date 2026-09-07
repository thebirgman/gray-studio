import { getScrollEventTarget, scrollContainerMediaQuery } from '@theme/scroll-container';

/**
 * FAQ page: search filter, mobile category chips, desktop nav active state.
 */
class FaqsPageComponent extends HTMLElement {
  /** @type {string} */
  #activeCategory = 'all';

  /** @type {string} */
  #activeNavHandle = '';

  /** @type {string} */
  #query = '';

  /** @type {number} */
  #scrollRaf = 0;

  /** @type {number} */
  #scrollSpyResumeAt = 0;

  /** @type {(() => void) | null} */
  #onScroll = null;

  /** @type {(() => void) | null} */
  #onResize = null;

  connectedCallback() {
    this.#searchInput = this.querySelector('[data-faqs-search]');
    this.#groups = Array.from(this.querySelectorAll('[data-faq-group]'));
    this.#items = Array.from(this.querySelectorAll('[data-faq-item]'));
    this.#chips = Array.from(this.querySelectorAll('[data-category-filter]'));
    this.#navLinks = Array.from(this.querySelectorAll('[data-category-nav]'));
    this.#empty = this.querySelector('[data-faqs-empty]');
    this.#rail = this.querySelector('.faqs-page__nav-rail');

    this.#searchInput?.addEventListener('input', () => {
      this.#query = (this.#searchInput?.value || '').trim().toLowerCase();
      if (this.#query) this.#setChipCategory('all');
      else this.#applyFilters();
    });

    this.#chips.forEach((chip) => {
      chip.addEventListener('click', () => {
        const category = chip.getAttribute('data-category-filter') || 'all';
        this.#setChipCategory(category);
      });
    });

    this.#navLinks.forEach((link) => {
      link.addEventListener('click', () => {
        const category = link.getAttribute('data-category-nav') || '';
        if (!category) return;
        this.#pauseScrollSpy(700);
        this.#setNavActive(category);
      });
    });

    this.#setupNavSpy();
  }

  disconnectedCallback() {
    this.#destroyNavSpy();
  }

  /**
   * @param {string} category
   */
  #setChipCategory(category) {
    this.#activeCategory = category;
    this.#chips.forEach((chip) => {
      const isActive = (chip.getAttribute('data-category-filter') || '') === category;
      chip.setAttribute('aria-pressed', isActive ? 'true' : 'false');
      chip.classList.toggle('is-active', isActive);
    });
    this.#applyFilters();
  }

  /**
   * @param {string} category
   */
  #setNavActive(category) {
    if (this.#activeNavHandle === category) {
      this.#updateNavIndicator();
      return;
    }

    this.#activeNavHandle = category;
    this.#navLinks.forEach((link) => {
      const isActive = (link.getAttribute('data-category-nav') || '') === category;
      link.classList.toggle('is-active', isActive);
      if (isActive) {
        link.setAttribute('aria-current', 'true');
      } else {
        link.removeAttribute('aria-current');
      }
    });
    this.#updateNavIndicator();
  }

  #applyFilters() {
    let visibleCount = 0;

    this.#groups.forEach((group) => {
      const handle = group.getAttribute('data-faq-group') || '';
      const categoryMatch = this.#activeCategory === 'all' || this.#activeCategory === handle;
      const items = Array.from(group.querySelectorAll('[data-faq-item]'));
      let groupVisible = 0;

      items.forEach((item) => {
        const text = (item.getAttribute('data-faq-text') || '').toLowerCase();
        const queryMatch = this.#query === '' || text.includes(this.#query);
        const show = categoryMatch && queryMatch;
        item.hidden = !show;
        if (show) {
          groupVisible += 1;
          visibleCount += 1;
        }
      });

      group.hidden = groupVisible === 0;
    });

    if (this.#empty) {
      this.#empty.hidden = visibleCount > 0;
    }

    this.#syncNavFromScroll();
  }

  #setupNavSpy() {
    if (this.#navLinks.length === 0 || this.#groups.length === 0) return;
    if (window.matchMedia('(max-width: 749px)').matches) return;

    this.#destroyNavSpy();

    this.#onScroll = () => {
      if (this.#scrollRaf) return;
      this.#scrollRaf = requestAnimationFrame(() => {
        this.#scrollRaf = 0;
        this.#syncNavFromScroll();
      });
    };

    this.#onResize = () => {
      this.#updateNavIndicator();
    };

    this.#onBreakpointChange = () => {
      this.#destroyNavSpy();
      this.#setupNavSpy();
    };

    this.#scrollTarget = getScrollEventTarget();
    this.#scrollTarget.addEventListener('scroll', this.#onScroll, { passive: true });
    window.addEventListener('resize', this.#onResize, { passive: true });
    scrollContainerMediaQuery.addEventListener('change', this.#onBreakpointChange);
    this.addEventListener('toggle', this.#onScroll, true);

    this.#syncNavFromScroll();
  }

  #destroyNavSpy() {
    if (this.#onScroll && this.#scrollTarget) {
      this.#scrollTarget.removeEventListener('scroll', this.#onScroll);
      this.removeEventListener('toggle', this.#onScroll, true);
      this.#onScroll = null;
      this.#scrollTarget = null;
    }
    if (this.#onResize) {
      window.removeEventListener('resize', this.#onResize);
      this.#onResize = null;
    }
    if (this.#onBreakpointChange) {
      scrollContainerMediaQuery.removeEventListener('change', this.#onBreakpointChange);
      this.#onBreakpointChange = null;
    }
    if (this.#scrollRaf) {
      cancelAnimationFrame(this.#scrollRaf);
      this.#scrollRaf = 0;
    }
  }

  /**
   * @param {number} ms
   */
  #pauseScrollSpy(ms) {
    this.#scrollSpyResumeAt = Date.now() + ms;
  }

  #getSpyOffset() {
    const header = document.querySelector('#header-component[data-sticky-state="active"]');
    const headerHeight =
      header instanceof HTMLElement ? header.getBoundingClientRect().height : 0;
    return headerHeight + 160;
  }

  #getVisibleGroups() {
    return this.#groups.filter((group) => !group.hidden);
  }

  #syncNavFromScroll() {
    if (window.matchMedia('(max-width: 749px)').matches) return;
    if (Date.now() < this.#scrollSpyResumeAt) return;

    const groups = this.#getVisibleGroups();
    if (groups.length === 0) return;

    const offset = this.#getSpyOffset();
    let activeHandle = groups[0].getAttribute('data-faq-group') || '';

    for (const group of groups) {
      const marker = group.querySelector('.faqs-page__group-heading') ?? group;
      const { top } = marker.getBoundingClientRect();
      if (top <= offset) {
        activeHandle = group.getAttribute('data-faq-group') || activeHandle;
      }
    }

    this.#setNavActive(activeHandle);
  }

  #updateNavIndicator() {
    if (!this.#rail || this.#navLinks.length === 0) return;
    if (window.matchMedia('(max-width: 749px)').matches) return;

    const active =
      this.#navLinks.find((link) => link.classList.contains('is-active')) || this.#navLinks[0];
    const nav = active.closest('.faqs-page__nav');
    if (!nav) return;

    const navRect = nav.getBoundingClientRect();
    const linkRect = active.getBoundingClientRect();
    const indicatorHeight = 25;
    const top = linkRect.top - navRect.top + (linkRect.height - indicatorHeight) / 2;
    this.#rail.style.setProperty('--nav-indicator-top', `${Math.max(0, top)}px`);
  }

  /** @type {HTMLInputElement | null} */
  #searchInput = null;

  /** @type {HTMLElement[]} */
  #groups = [];

  /** @type {HTMLElement[]} */
  #items = [];

  /** @type {HTMLElement[]} */
  #chips = [];

  /** @type {HTMLElement[]} */
  #navLinks = [];

  /** @type {HTMLElement | null} */
  #empty = null;

  /** @type {HTMLElement | null} */
  #rail = null;

  /** @type {EventTarget | null} */
  #scrollTarget = null;

  /** @type {(() => void) | null} */
  #onBreakpointChange = null;
}

if (!customElements.get('faqs-page-component')) {
  customElements.define('faqs-page-component', FaqsPageComponent);
}
