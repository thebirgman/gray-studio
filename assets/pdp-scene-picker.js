class PdpScenePicker extends HTMLElement {
  connectedCallback() {
    this.perPage = Number(this.dataset.perPage) || 11;
    this.select = this.querySelector('[data-scene-collection]');
    this.prevButtons = this.querySelectorAll('[data-scene-prev]');
    this.nextButtons = this.querySelectorAll('[data-scene-next]');
    this.pageButtons = this.querySelectorAll('[data-scene-page-btn]');

    this.select?.addEventListener('change', this.onCollectionChange);
    this.prevButtons.forEach((button) => button.addEventListener('click', this.onPrev));
    this.nextButtons.forEach((button) => button.addEventListener('click', this.onNext));
    this.pageButtons.forEach((button) => button.addEventListener('click', this.onPageButton));
    this.setPage(0);
  }

  disconnectedCallback() {
    this.select?.removeEventListener('change', this.onCollectionChange);
    this.prevButtons?.forEach((button) => button.removeEventListener('click', this.onPrev));
    this.nextButtons?.forEach((button) => button.removeEventListener('click', this.onNext));
    this.pageButtons?.forEach((button) => button.removeEventListener('click', this.onPageButton));
  }

  get activePanel() {
    return this.querySelector('[data-scene-collection-panel]:not([hidden])');
  }

  onCollectionChange = () => {
    const handle = this.select?.value;
    this.querySelectorAll('[data-scene-collection-panel]').forEach((panel) => {
      panel.hidden = panel.dataset.sceneCollectionPanel !== handle;
    });
    this.setPage(0);
  };

  onPrev = (event) => {
    event.preventDefault();
    this.setPage(this.currentPage() - 1);
  };

  onNext = (event) => {
    event.preventDefault();
    this.setPage(this.currentPage() + 1);
  };

  onPageButton = (event) => {
    event.preventDefault();
    const page = Number(event.currentTarget.dataset.scenePageBtn);
    if (Number.isNaN(page)) return;
    this.setPage(page);
  };

  items() {
    return [...(this.activePanel?.querySelectorAll('[data-scene-item]') || [])];
  }

  pageCount() {
    return Math.max(1, Math.ceil(this.items().length / this.perPage));
  }

  currentPage() {
    const items = this.items();
    const firstVisible = items.findIndex((item) => !item.hidden);
    if (firstVisible < 0) return 0;
    return Math.floor(firstVisible / this.perPage);
  }

  setPage(index) {
    const items = this.items();
    if (!items.length) return;

    const pageCount = this.pageCount();
    const next = Math.max(0, Math.min(index, pageCount - 1));
    items.forEach((item, itemIndex) => {
      item.hidden = Math.floor(itemIndex / this.perPage) !== next;
    });

    const panel = this.activePanel;
    panel?.querySelectorAll('[data-scene-page-btn]').forEach((button) => {
      const selected = Number(button.dataset.scenePageBtn) === next;
      button.setAttribute('aria-current', selected ? 'page' : 'false');
      button.classList.toggle('pdp-scene-picker__page-btn--current', selected);
    });

    const prevDisabled = next === 0;
    const nextDisabled = next >= pageCount - 1;
    this.prevButtons.forEach((button) => {
      button.disabled = prevDisabled;
    });
    this.nextButtons.forEach((button) => {
      button.disabled = nextDisabled;
    });
  }
}

if (!customElements.get('pdp-scene-picker')) {
  customElements.define('pdp-scene-picker', PdpScenePicker);
}
