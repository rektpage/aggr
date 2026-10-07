/**
 * liquidation-terminal: Hyperliquid may never run on its own in a pane.
 *
 * Its liquidations are relayed by the embedding dashboard, and the dashboard only shows them
 * mixed with other venues. So any pane that gets a Hyperliquid market also gets the Binance
 * Futures and OKX perpetuals for the same coin. A coin those two do not list (most HIP-3
 * markets) cannot be followed on Hyperliquid alone, and its Hyperliquid market is dropped.
 */
import {
  ensureIndexedProducts,
  getMarketProduct,
  indexedProducts,
  parseMarket
} from '@/services/productsService'
import { HYPERLIQUID, HYPERLIQUID_PARTNERS } from '@/store/exchanges'

const normalizeBase = (base: string) =>
  String(base)
    .replace(/^k(?=[A-Z])/, '')
    .toUpperCase()
    .replace(/^(1000000|100000|10000|1000|100)(?=[A-Z])/, '')

const baseOf = (market: string) => {
  const [exchange, pair] = parseMarket(market)
  return normalizeBase(getMarketProduct(exchange, pair).base)
}

export async function withHyperliquidPartners(
  markets: string[]
): Promise<{ markets: string[]; dropped: string[] }> {
  const hyperliquid = markets.filter(m => m.startsWith(HYPERLIQUID + ':'))

  if (!hyperliquid.length) {
    return { markets, dropped: [] }
  }

  await ensureIndexedProducts()

  const out = [...markets]
  const dropped: string[] = []

  for (const market of hyperliquid) {
    const base = baseOf(market)
    const additions: string[] = []
    let missing = false

    for (const partner of HYPERLIQUID_PARTNERS) {
      if (out.some(m => m.startsWith(partner + ':') && baseOf(m) === base)) {
        continue
      }

      const candidates = (indexedProducts[partner] || []).filter(
        product =>
          product.type === 'perp' && normalizeBase(product.base) === base
      )
      const pick =
        candidates.find(product => product.quote === 'USDT') ||
        candidates.find(product => product.quote === 'USD')

      if (pick) {
        additions.push(pick.id)
      } else {
        missing = true
      }
    }

    if (missing) {
      out.splice(out.indexOf(market), 1)
      dropped.push(market)
    } else {
      out.push(...additions.filter(m => out.indexOf(m) === -1))
    }
  }

  return { markets: out, dropped }
}
