import Vue from 'vue'
import store from '@/store'

/**
 * rekt.page (2026-10-10): the embedding app can pin the trade / liquidation list thresholds to its
 * own per-coin preset ("알림 기준 = 기본값"). While pinned, the thresholds editor is read-only so the
 * list keeps matching the history the app serves for that preset.
 */
export const rektPreset = Vue.observable({ locked: false })

/**
 * The last day of the trade / liquidation lists at the preset thresholds (proxy /tape/{coin}), newest
 * first, in the shape the trades feed takes. Kept so a pane that mounts later (markets change) can
 * still fill itself. Only set while the preset is on — custom thresholds get no history.
 */
export const tapeBus = new Vue()
export let lastTape: any[] | null = null
const TAPE_URL = String(import.meta.env.VITE_APP_API_URL || '').replace(/\/bars\/?$/, '') + '/tape/'

async function loadTape(coin: string) {
  try {
    const res = await fetch(TAPE_URL + coin)
    if (!res.ok) return
    const body = await res.json()
    const rows = [
      ...(body.trades || []).map(r => [r, false]),
      ...(body.liquidations || []).map(r => [r, true])
    ]
      .map(([[timestamp, exchange, pair, side, price, size, usd], liquidation]) => ({
        timestamp,
        exchange,
        pair,
        side,
        price,
        avgPrice: price,
        size,
        amount: usd,
        count: 1,
        liquidation
      }))
      .sort((a, b) => b.timestamp - a.timestamp)
    if (!rektPreset.locked) return
    lastTape = rows
    tapeBus.$emit('prefill', rows)
  } catch {
    // history is a nicety; the live lists keep working without it
  }
}

/** each level as a multiple of the first one — aggr's stock ladders (100k/250k/1M/10M, 50k/100k/200k/1M) */
const TRADE_LADDER = [1, 2.5, 10, 100]
const LIQUIDATION_LADDER = [1, 2, 4, 20]

function applyLadder(paneId: string, list: { id: string; amount: number }[], base: number, ladder: number[]) {
  const sorted = [...list].sort((a, b) => a.amount - b.amount)
  sorted.forEach((threshold, i) => {
    // more levels than the stock ladder: keep growing ×10 per extra level
    const factor = i < ladder.length ? ladder[i] : ladder[ladder.length - 1] * 10 ** (i - ladder.length + 1)
    store.commit(`${paneId}/SET_THRESHOLD_AMOUNT`, { id: threshold.id, value: base * factor })
  })
}

/** Pins every trades pane to the given minimums, or releases the lock when `values` is null */
export function applyRektPreset(values: { trades: number; liquidations: number; coin?: string } | null) {
  rektPreset.locked = Boolean(values)
  if (!values) {
    lastTape = null
    return
  }
  for (const paneId in store.state.panes.panes) {
    if (store.state.panes.panes[paneId].type !== 'trades') continue
    const pane = store.state[paneId]
    if (!pane) continue
    // the "small ↔ large orders" multiplier scales every threshold; reset it before pinning the amounts
    if (pane.thresholdsMultipler !== 1) store.commit(paneId + '/SET_THRESHOLDS_MULTIPLER', { value: 1, market: '' })
    if (pane.thresholds?.length) applyLadder(paneId, pane.thresholds, values.trades, TRADE_LADDER)
    if (pane.liquidations?.length) applyLadder(paneId, pane.liquidations, values.liquidations, LIQUIDATION_LADDER)
  }
  // the panes may be rebuilt for the new markets first — give them a moment, then fill them
  if (values.coin) setTimeout(() => loadTape(String(values.coin).toUpperCase()), 800)
}
