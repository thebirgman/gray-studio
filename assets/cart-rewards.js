import { Component } from '@theme/component';
import { fetchConfig } from '@theme/utilities';
import { CartLinesUpdateEvent, StandardEvents } from '@shopify/events';

/**
 * @typedef {object} RewardConfig
 * @property {number} [variantId]
 * @property {number} [productId]
 * @property {number} threshold
 * @property {string} key
 */

/**
 * Automatically adds/removes configured reward products when the cart
 * subtotal crosses the gift-card or secret-gift thresholds.
 *
 * @extends {Component}
 */
class CartRewardsController extends Component {
  /** @type {RewardConfig[]} */
  #rewards = [];

  /** @type {boolean} */
  #busy = false;

  connectedCallback() {
    super.connectedCallback();
    this.#rewards = this.#readConfig();
    if (!this.#rewards.length) return;

    document.addEventListener(StandardEvents.cartLinesUpdate, this.#onCartUpdate);
    this.#reconcileFromAjaxCart();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener(StandardEvents.cartLinesUpdate, this.#onCartUpdate);
  }

  /** @returns {RewardConfig[]} */
  #readConfig() {
    const script = this.querySelector('script[type="application/json"]');
    if (!script?.textContent) return [];

    try {
      const parsed = JSON.parse(script.textContent);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((item) => item?.key && item?.threshold > 0 && (item?.variantId || item?.productId));
    } catch {
      return [];
    }
  }

  /**
   * @param {import('@shopify/events').CartLinesUpdateEvent} event
   */
  #onCartUpdate = (event) => {
    if (this.#busy) return;

    event.promise
      ?.then(() => this.#reconcileFromAjaxCart(event.action))
      .catch((error) => {
        if (error?.name !== 'AbortError') console.warn('[cart-rewards] Event promise rejected:', error);
      });
  };

  /**
   * @param {string} [action]
   */
  async #reconcileFromAjaxCart(action) {
    try {
      const cart = await fetch(`${Theme.routes.cart_url}.js`).then((response) => response.json());
      await this.#reconcile(cart?.items ?? [], action);
    } catch (error) {
      console.warn('[cart-rewards] Cart fetch failed:', error);
    }
  }

  /**
   * @param {Array<Record<string, unknown>>} items
   * @param {string} [action]
   */
  async #reconcile(items, action) {
    if (this.#busy || !this.#rewards.length) return;

    const cartItems = Array.isArray(items) ? items : [];
    const qualifyingTotal = this.#qualifyingTotal(cartItems);
    /** @type {Array<{ action: 'add' | 'remove', reward: RewardConfig, line?: string }>} */
    const ops = [];

    for (const reward of this.#rewards) {
      const line = this.#findRewardLine(cartItems, reward);
      const qualifies = qualifyingTotal >= reward.threshold;
      const dismissed = this.#isDismissed(reward.key);

      if (qualifies && !line && action === 'remove') {
        this.#dismiss(reward.key);
        continue;
      }

      if (qualifies && !line && !dismissed) {
        if (!reward.variantId) continue;
        ops.push({ action: 'add', reward });
      } else if (!qualifies && line?.key) {
        this.#clearDismissed(reward.key);
        ops.push({ action: 'remove', reward, line: String(line.key) });
      }
    }

    if (!ops.length) return;

    this.#busy = true;
    try {
      for (const op of ops) {
        if (op.action === 'add') {
          await this.#addReward(op.reward);
        } else if (op.line) {
          await this.#removeReward(op.line);
        }
      }
    } catch (error) {
      console.warn('[cart-rewards] Failed to sync rewards:', error);
    } finally {
      this.#busy = false;
    }
  }

  /**
   * @param {Array<Record<string, unknown>>} items
   * @returns {number}
   */
  #qualifyingTotal(items) {
    return items.reduce((sum, item) => {
      if (this.#isRewardItem(item)) return sum;
      return sum + Number(item.final_line_price ?? item.linePrice ?? 0);
    }, 0);
  }

  /**
   * @param {Record<string, unknown>} item
   * @returns {string}
   */
  #rewardKey(item) {
    const properties = /** @type {Record<string, string> | undefined} */ (item.properties);
    return properties?._cart_reward || '';
  }

  /**
   * @param {Array<Record<string, unknown>>} items
   * @param {RewardConfig} reward
   */
  #findRewardLine(items, reward) {
    return items.find((item) => this.#rewardKey(item) === reward.key);
  }

  /** @param {string} key */
  #dismissKey(key) {
    return `cart-reward-dismissed-${key}`;
  }

  /** @param {string} key */
  #isDismissed(key) {
    try {
      return sessionStorage.getItem(this.#dismissKey(key)) === '1';
    } catch {
      return false;
    }
  }

  /** @param {string} key */
  #dismiss(key) {
    try {
      sessionStorage.setItem(this.#dismissKey(key), '1');
    } catch {
      // Ignore storage errors (private mode).
    }
  }

  /** @param {string} key */
  #clearDismissed(key) {
    try {
      sessionStorage.removeItem(this.#dismissKey(key));
    } catch {
      // Ignore storage errors (private mode).
    }
  }

  /** @returns {string} */
  #sections() {
    const ids = new Set();
    document.querySelectorAll('cart-items-component').forEach((item) => {
      if (item instanceof HTMLElement && item.dataset.sectionId) ids.add(item.dataset.sectionId);
    });
    return Array.from(ids).join(',');
  }

  /**
   * @param {RewardConfig} reward
   */
  async #addReward(reward) {
    const deferred = CartLinesUpdateEvent.createPromise();
    this.dispatchEvent(
      new CartLinesUpdateEvent({
        action: 'update',
        context: 'cart',
        lines: [{ merchandiseId: String(reward.variantId), quantity: 1 }],
        promise: deferred.promise,
      })
    );

    const payload = {
      items: [
        {
          id: reward.variantId,
          quantity: 1,
          properties: { _cart_reward: reward.key },
        },
      ],
      sections: this.#sections(),
      sections_url: window.location.pathname,
    };

    const cfg = fetchConfig('json', { body: JSON.stringify(payload) });
    const response = await fetch(Theme.routes.cart_add_url, cfg);
    const data = await response.json();

    if (data.status && data.status !== 200) {
      deferred.reject(new Error(data.message || 'Reward add failed'));
      throw new Error(data.message || 'Reward add failed');
    }

    let cart = null;
    try {
      cart = CartLinesUpdateEvent.createCartFromAjaxResponse(data);
    } catch {
      cart = null;
    }

    deferred.resolve({
      cart,
      detail: {
        sections: data.sections,
        items: data.items,
        source: 'cart-rewards',
        didError: false,
      },
    });
  }

  /**
   * @param {string} lineKey
   */
  async #removeReward(lineKey) {
    if (!lineKey) return;

    const deferred = CartLinesUpdateEvent.createPromise();
    this.dispatchEvent(
      new CartLinesUpdateEvent({
        action: 'remove',
        context: 'cart',
        lines: [{ id: lineKey, quantity: 0 }],
        promise: deferred.promise,
      })
    );

    const payload = {
      id: lineKey,
      quantity: 0,
      sections: this.#sections(),
      sections_url: window.location.pathname,
    };

    const response = await fetch(Theme.routes.cart_change_url, fetchConfig('json', { body: JSON.stringify(payload) }));
    const data = await response.json();

    if (data.errors) {
      deferred.reject(new Error(String(data.errors)));
      throw new Error(String(data.errors));
    }

    let cart = null;
    try {
      cart = CartLinesUpdateEvent.createCartFromAjaxResponse(data);
    } catch {
      cart = null;
    }

    deferred.resolve({
      cart,
      detail: {
        sections: data.sections,
        items: data.items,
        source: 'cart-rewards',
        didError: false,
      },
    });
  }
}

if (!customElements.get('cart-rewards-controller')) {
  customElements.define('cart-rewards-controller', CartRewardsController);
}
