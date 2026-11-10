class CustomArtworkPdp extends HTMLElement {
  connectedCallback() {
    this.sceneHandle = this.dataset.sceneHandle;
    this.widget = this.querySelector('[data-pp-widget]');
    if (!this.sceneHandle || !this.widget) return;

    this.select = this.widget.querySelector('[data-pp-collection]');
    this.thumbs = this.widget.querySelector('[data-pp-thumbs]');
    if (!this.select || !this.thumbs) return;

    this.userInteracted = false;
    this.widget.addEventListener('pointerdown', this.onUserInteraction, { capture: true });
    this.widget.addEventListener('keydown', this.onUserInteraction, { capture: true });

    this.preselectScene();
  }

  disconnectedCallback() {
    this.widget?.removeEventListener('pointerdown', this.onUserInteraction, { capture: true });
    this.widget?.removeEventListener('keydown', this.onUserInteraction, { capture: true });
    this.observer?.disconnect();
  }

  onUserInteraction = () => {
    this.userInteracted = true;
  };

  async preselectScene() {
    const collection = await this.findSceneCollection();
    if (!collection || !this.isConnected) return;

    await this.waitFor(() => Array.from(this.select.options).some((option) => option.value === collection), this.select);
    if (this.userInteracted) return;

    if (this.select.value !== collection) {
      this.select.value = collection;
      this.select.dispatchEvent(new Event('change', { bubbles: true }));
    }

    const thumb = await this.waitFor(() => this.findThumb(), this.thumbs);
    if (!thumb || this.userInteracted) return;

    if (!thumb.classList.contains('is-selected')) thumb.click();
    const offset = thumb.getBoundingClientRect().left - this.thumbs.getBoundingClientRect().left;
    this.thumbs.scrollLeft += offset;
  }

  async findSceneCollection() {
    const proxyPath = this.widget.dataset.proxyPath;
    if (!proxyPath) return null;

    try {
      const response = await fetch(`${proxyPath}/scenes`);
      if (!response.ok) return null;
      const data = await response.json();
      const scenes = Array.isArray(data.scenes) ? data.scenes : [];
      const scene = scenes.find((item) => item.id === this.sceneHandle);
      return scene ? scene.collection || 'Scenes' : null;
    } catch (error) {
      return null;
    }
  }

  findThumb() {
    return Array.from(this.thumbs.querySelectorAll('[data-scene-id]')).find(
      (button) => button.dataset.sceneId === this.sceneHandle
    );
  }

  waitFor(check, target, timeout = 10000) {
    const found = check();
    if (found) return Promise.resolve(found);

    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.observer?.disconnect();
        resolve(null);
      }, timeout);

      this.observer?.disconnect();
      this.observer = new MutationObserver(() => {
        const result = check();
        if (!result) return;
        clearTimeout(timer);
        this.observer.disconnect();
        resolve(result);
      });
      this.observer.observe(target, { childList: true, subtree: true });
    });
  }
}

if (!customElements.get('custom-artwork-pdp')) {
  customElements.define('custom-artwork-pdp', CustomArtworkPdp);
}
