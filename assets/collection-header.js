import { Component } from '@theme/component';
import { CollectionUpdateEvent } from '@shopify/events';
import { sectionRenderer } from '@theme/section-renderer';
import { startViewTransition } from '@theme/utilities';

/**
 * Collection header with expandable description and in-page destination filters.
 *
 * Destination pills still point at collections (so refresh/share stay correct),
 * but primary clicks are intercepted and the header + product grid are
 * re-rendered via the Section Rendering API instead of a full navigation.
 */
class CollectionHeaderComponent extends Component {
  connectedCallback() {
    super.connectedCallback();

    this.#ensureLearnMoreLabel();
    this.addEventListener('click', this.#handleClick);
    window.addEventListener('popstate', this.#handlePopState);
  }

  disconnectedCallback() {
    this.removeEventListener('click', this.#handleClick);
    window.removeEventListener('popstate', this.#handlePopState);
    super.disconnectedCallback();
  }

  updatedCallback() {
    super.updatedCallback();
    this.#ensureLearnMoreLabel();
  }

  /** @type {number} */
  #navigationId = 0;

  #ensureLearnMoreLabel() {
    const label = this.querySelector('[data-learn-more-label]');
    if (!(label instanceof HTMLElement) || label.dataset.defaultLabel) return;

    label.dataset.defaultLabel = label.textContent?.trim() || 'Learn more';
  }

  /**
   * @param {MouseEvent} event
   */
  #handleClick = (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const learnMore = target.closest('[data-learn-more]');
    if (learnMore instanceof HTMLElement && this.contains(learnMore)) {
      this.#toggleDescription();
      return;
    }

    this.#handlePillClick(event);
  };

  /**
   * Intercepts unmodified primary clicks on destination pills.
   * @param {MouseEvent} event
   */
  #handlePillClick = (event) => {
    if (window.Shopify?.designMode) return;
    if (event.defaultPrevented) return;
    if (event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

    const target = event.target;
    if (!(target instanceof Element)) return;

    const link = /** @type {HTMLAnchorElement | null} */ (target.closest('a.collection-header__pill'));
    if (!link || !this.contains(link) || !link.href) return;

    const nextUrl = new URL(link.href, window.location.origin);
    if (nextUrl.origin !== window.location.origin) return;
    if (!this.#isCollectionPath(nextUrl.pathname)) return;

    event.preventDefault();

    const currentPath = this.#normalizePath(window.location.pathname);
    const nextPath = this.#normalizePath(nextUrl.pathname);
    const alreadyActive =
      link.classList.contains('is-active') || link.getAttribute('aria-current') === 'page';
    if (currentPath === nextPath && alreadyActive) return;

    this.#navigate(nextUrl, { push: true, restoreFocus: true });
  };

  #handlePopState = () => {
    if (window.Shopify?.designMode) return;

    const url = new URL(window.location.href);
    if (!this.#isCollectionPath(url.pathname)) return;

    this.#navigate(url, { push: false, restoreFocus: false });
  };

  /**
   * @param {URL} targetUrl
   * @param {{ push: boolean, restoreFocus: boolean }} options
   */
  async #navigate(targetUrl, { push, restoreFocus }) {
    const resultsList = document.querySelector('results-list');
    const gridSectionId = resultsList?.getAttribute('section-id') ?? '';
    const headerSectionId = this.#headerSectionId;

    if (!gridSectionId) {
      if (push) window.location.assign(targetUrl.toString());
      return;
    }

    const url = this.#buildFilterUrl(targetUrl);

    if (push) {
      history.pushState({}, '', url.toString());
    }

    const navigationId = ++this.#navigationId;
    this.dataset.loading = 'true';
    this.setAttribute('aria-busy', 'true');
    resultsList?.setAttribute('aria-busy', 'true');

    const renderPromise = startViewTransition(async () => {
      const renders = [
        sectionRenderer.renderSection(gridSectionId, {
          url: new URL(url),
          cache: false,
        }),
      ];

      if (headerSectionId) {
        renders.push(
          sectionRenderer.renderSection(headerSectionId, {
            url: new URL(url),
            cache: false,
          })
        );
      }

      await Promise.all(renders);
      document.querySelector('results-list')?.pages?.clear?.();
    }, ['product-grid']);

    this.#dispatchCollectionUpdate(resultsList, renderPromise);

    try {
      await renderPromise;

      if (restoreFocus) {
        this.#focusPillForPath(url.pathname);
      }
    } catch (error) {
      if (/** @type {{ name?: string }} */ (error)?.name === 'AbortError') return;
      console.error(error);
      window.location.assign(url.toString());
    } finally {
      if (navigationId !== this.#navigationId) return;

      this.removeAttribute('aria-busy');
      delete this.dataset.loading;
      document.querySelector('results-list')?.removeAttribute('aria-busy');
    }
  }

  /**
   * Keep preview/sort/facet params from the current URL; drop pagination.
   * @param {URL} targetUrl
   * @returns {URL}
   */
  #buildFilterUrl(targetUrl) {
    const url = new URL(window.location.href);
    url.pathname = targetUrl.pathname;
    url.hash = '';
    url.searchParams.delete('page');
    url.searchParams.delete('section_id');

    for (const [key, value] of targetUrl.searchParams) {
      if (key === 'page' || key === 'section_id') continue;
      url.searchParams.set(key, value);
    }

    return url;
  }

  /**
   * @param {Element | null} resultsList
   * @param {Promise<unknown>} renderPromise
   */
  #dispatchCollectionUpdate(resultsList, renderPromise) {
    if (!(resultsList instanceof HTMLElement)) return;

    try {
      const deferredPromise = CollectionUpdateEvent.createPromise();
      const productFilters = CollectionUpdateEvent.parseProductFilters();
      const handle = window.location.pathname.split('/').filter(Boolean).pop() ?? '';

      resultsList.dispatchEvent(
        new CollectionUpdateEvent({
          collection: {
            id: null,
            handle,
            productsCount: 0,
          },
          ...(productFilters && { productFilters }),
          sortKey: CollectionUpdateEvent.getSortKey(),
          promise: deferredPromise.promise,
        })
      );

      renderPromise
        .then(() => deferredPromise.resolve({ productsCount: 0 }))
        .catch((error) => deferredPromise.reject(error));
    } catch (error) {
      console.error(error);
    }
  }

  /**
   * @param {string} pathname
   */
  #focusPillForPath(pathname) {
    const path = this.#normalizePath(pathname);
    const header = document.querySelector('collection-header-component');
    const pills = header?.querySelectorAll('a.collection-header__pill') ?? [];

    for (const pill of pills) {
      if (!(pill instanceof HTMLAnchorElement)) continue;

      try {
        if (this.#normalizePath(new URL(pill.href, window.location.origin).pathname) === path) {
          pill.focus();
          return;
        }
      } catch {
        // Ignore malformed hrefs.
      }
    }
  }

  /**
   * @param {string} pathname
   * @returns {boolean}
   */
  #isCollectionPath(pathname) {
    const path = this.#normalizePath(pathname);
    return path === '/collections' || path.includes('/collections/');
  }

  /**
   * @param {string} pathname
   * @returns {string}
   */
  #normalizePath(pathname) {
    if (pathname === '/') return pathname;
    return pathname.replace(/\/+$/, '');
  }

  get #headerSectionId() {
    const section = this.closest('.shopify-section');
    if (!section?.id) return '';
    return section.id.replace(/^shopify-section-/, '');
  }

  #toggleDescription = () => {
    const button = this.querySelector('[data-learn-more]');
    const description = this.querySelector('[data-description]');
    const preview = this.querySelector('[data-description-preview]');
    const full = this.querySelector('[data-description-full]');
    const learnMoreLabel = this.querySelector('[data-learn-more-label]');
    const showLessLabel = this.querySelector('[data-show-less-label]');

    const expanded = this.getAttribute('data-expanded') === 'true';
    const next = !expanded;

    this.setAttribute('data-expanded', String(next));
    description?.setAttribute('data-open', String(next));
    button?.setAttribute('aria-expanded', String(next));

    if (full instanceof HTMLElement) full.hidden = !next;
    if (preview instanceof HTMLElement && full instanceof HTMLElement) preview.hidden = next;

    if (learnMoreLabel instanceof HTMLElement) {
      learnMoreLabel.textContent = next
        ? showLessLabel?.textContent?.trim() || 'Show less'
        : learnMoreLabel.dataset.defaultLabel || 'Learn more';
    }
  };
}

if (!customElements.get('collection-header-component')) {
  customElements.define('collection-header-component', CollectionHeaderComponent);
}
