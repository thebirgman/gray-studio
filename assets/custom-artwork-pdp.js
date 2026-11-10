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
    this.galleryObserver?.disconnect();
    clearTimeout(this.galleryTimer);
  }

  onUserInteraction = () => {
    this.userInteracted = true;
  };

  async preselectScene() {
    const collection = await this.findSceneCollection();
    if (!collection || !this.isConnected) return;

    await this.waitFor(() => Array.from(this.select.options).some((option) => option.value === collection), this.select);
    if (this.userInteracted) return;

    const skippedImages = new Set();
    const rememberSelectedImage = () => {
      const src = this.thumbs.querySelector('.is-selected img')?.getAttribute('src');
      if (src) skippedImages.add(src);
    };

    rememberSelectedImage();
    if (this.select.value !== collection) {
      this.select.value = collection;
      this.select.dispatchEvent(new Event('change', { bubbles: true }));
    }

    const thumb = await this.waitFor(() => this.findThumb(), this.thumbs);
    if (!thumb || this.userInteracted) return;

    rememberSelectedImage();
    if (!thumb.classList.contains('is-selected')) thumb.click();

    const offset = thumb.getBoundingClientRect().left - this.thumbs.getBoundingClientRect().left;
    this.thumbs.scrollLeft += offset;

    const sceneImage = thumb.querySelector('img')?.getAttribute('src');
    skippedImages.delete(sceneImage);
    if (sceneImage && skippedImages.size) this.keepGalleryOnScene(thumb, sceneImage, skippedImages);
  }

  async keepGalleryOnScene(thumb, sceneImage, skippedImages) {
    let lastCorrection = 0;
    const correct = () => {
      if (this.userInteracted) return;
      const galleryImage = document.querySelector('.product-media__image');
      if (!galleryImage?.dataset.ppSwapped || galleryImage.getAttribute('src') === sceneImage) return;
      if (Date.now() - lastCorrection < 300) return;
      lastCorrection = Date.now();
      thumb.click();
    };

    this.galleryObserver?.disconnect();
    this.galleryObserver = new MutationObserver(correct);
    this.galleryObserver.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['src'] });

    const imageSettled = (src) =>
      new Promise((resolve) => {
        const probe = new Image();
        probe.onload = probe.onerror = resolve;
        probe.src = src;
      });
    const timeout = new Promise((resolve) => {
      this.galleryTimer = setTimeout(resolve, 20000);
    });

    await Promise.race([Promise.all([...skippedImages].map(imageSettled)), timeout]);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    lastCorrection = 0;
    correct();

    clearTimeout(this.galleryTimer);
    this.galleryObserver?.disconnect();
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
