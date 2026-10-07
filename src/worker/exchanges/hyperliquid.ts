import Exchange from '../exchange'

export default class HYPERLIQUID extends Exchange {
  id = 'HYPERLIQUID'
  protected endpoints: { [id: string]: any } = {
    PRODUCTS: [
      {
        url: 'https://api.hyperliquid.xyz/info',
        method: 'POST',
        // liquidation-terminal: core perps plus every HIP-3 builder dex (xyz:TSLA, km:US500…)
        // in one request; `meta` only lists the core perps
        data: JSON.stringify({ type: 'allPerpMetas' }),
        proxy: false
      }
    ]
  }

  async getUrl() {
    return 'wss://api.hyperliquid.xyz/ws'
  }

  formatProducts(response) {
    const products = []

    // allPerpMetas: one meta per dex, the core one first. A plain `meta` object is still accepted.
    const metas = Array.isArray(response) ? response : [response]

    for (const meta of metas) {
      if (meta && meta.universe && meta.universe.length) {
        for (const product of meta.universe) {
          products.push(product.name)
        }
      }
    }

    return {
      products
    }
  }

  /**
   * liquidation-terminal: product lists cached before HIP-3 support only hold core perps.
   * Rejecting them makes the worker refetch instead of waiting out the 7-day cache.
   */
  validateProducts(data) {
    return !!(
      data &&
      Array.isArray(data.products) &&
      data.products.some(name => name.indexOf(':') !== -1)
    )
  }

  /**
   * Sub
   * @param {WebSocket} api
   * @param {string} pair
   */
  async subscribe(api, pair) {
    if (!(await super.subscribe(api, pair))) {
      return
    }

    api.send(
      JSON.stringify({
        method: 'subscribe',
        subscription: {
          type: 'trades',
          coin: pair
        }
      })
    )

    return true
  }

  /**
   * Sub
   * @param {WebSocket} api
   * @param {string} pair
   */
  async unsubscribe(api, pair) {
    if (!(await super.unsubscribe(api, pair))) {
      return
    }

    api.send(
      JSON.stringify({
        method: 'unsubscribe',
        subscription: {
          type: 'trades',
          coin: pair
        }
      })
    )

    return true
  }

  onMessage(event, api) {
    const json = JSON.parse(event.data)

    if (json && json.channel === 'trades') {
      return this.emitTrades(
        api.id,
        json.data.map(t => this.formatResponse(t))
      )
    }
  }

  formatResponse(t) {
    return {
      exchange: this.id,
      pair: t.coin,
      timestamp: +new Date(t.time),
      price: +t.px,
      size: +t.sz,
      side: t.side === 'B' ? 'buy' : 'sell'
    }
  }
}
