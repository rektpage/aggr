import aggregatorService from '@/services/aggregatorService'
import Vue from 'vue'
import { ActionTree, GetterTree, Module, MutationTree } from 'vuex'
import { ModulesState } from '.'

export interface ExchangeSettings {
  disabled?: boolean
}

export type ExchangesState = { [exchangeId: string]: ExchangeSettings } & {
  _id: string
  _exchanges: string[]
}

// liquidation-terminal: Hyperliquid may only run together with these exchanges (see toggleExchange)
export const HYPERLIQUID = 'HYPERLIQUID'
export const HYPERLIQUID_PARTNERS = ['BINANCE_FUTURES', 'OKEX']

export const supportedExchanges = import.meta.env.VITE_APP_EXCHANGES.split(
  ','
).map(id => id.toUpperCase())

const state = supportedExchanges.reduce(
  (exchangesState: ExchangesState, id: string) => {
    exchangesState[id] = {
      disabled:
        /CRYPTOCOM|BITMART|HITBTC|MEXC|ASTER|PHEMEX|BINANCE_US|GATEIO/.test(id)
    }

    return exchangesState
  },
  {
    _exchanges: []
  } as any
) as ExchangesState

state._id = 'exchanges'

const getters = {
  getExchanges: state =>
    Object.keys(state).filter(id => id !== 'INDEX' && !/^_/.test(id))
} as GetterTree<ExchangesState, ModulesState>

const actions = {
  async boot({ dispatch }) {
    await dispatch('prepareExchanges')
  },
  prepareExchanges({ state, getters, rootState }) {
    state._exchanges.splice(0, state._exchanges.length)

    for (const id of getters.getExchanges) {
      if (supportedExchanges.indexOf(id) === -1) {
        if (rootState.settings.searchExchanges[id]) {
          delete rootState.settings.searchExchanges[id]
        }

        if (rootState.exchanges[id]) {
          delete rootState.exchanges[id]
        }

        continue
      }

      state._exchanges.push(id)
      rootState.app.activeExchanges[id] = !state[id].disabled
    }
  },
  async toggleExchange({ commit, state, dispatch }, id: string) {
    commit('TOGGLE_EXCHANGE', id)

    if (state[id].disabled) {
      await dispatch('disconnect', id)
    } else {
      await dispatch('connect', id)
    }

    this.commit('app/EXCHANGE_UPDATED', id)

    // liquidation-terminal: Hyperliquid liquidations are relayed by the embedding dashboard
    // and must never be shown on their own, so Hyperliquid only runs alongside these two.
    if (id === HYPERLIQUID && !state[id].disabled) {
      for (const partner of HYPERLIQUID_PARTNERS) {
        if (state[partner] && state[partner].disabled) {
          await dispatch('toggleExchange', partner)
        }
      }
    } else if (
      HYPERLIQUID_PARTNERS.includes(id) &&
      state[id].disabled &&
      state[HYPERLIQUID] &&
      !state[HYPERLIQUID].disabled
    ) {
      await dispatch('toggleExchange', HYPERLIQUID)
    }
  },
  async disconnect({ rootState }, id: string) {
    const exchangeRegex = new RegExp(`^${id}:`, 'i')
    const markets = Object.keys(rootState.panes.marketsListeners).filter(p =>
      exchangeRegex.test(p)
    )

    console.log(
      `[exchanges.${id}] manually disconnecting ${markets.join(', ')}`
    )

    await aggregatorService.disconnect(markets)
  },
  async connect({ rootState }, id: string) {
    const exchangeRegex = new RegExp(`^${id}:`, 'i')
    const markets = Object.keys(rootState.panes.marketsListeners).filter(p =>
      exchangeRegex.test(p)
    )

    console.log(`[exchanges.${id}] manually connecting ${markets.join(', ')}`)

    await aggregatorService.connect(markets)
  }
} as ActionTree<ExchangesState, ModulesState>

const mutations = {
  TOGGLE_EXCHANGE: (state, id: string) => {
    let disabled = true

    if (typeof state[id].disabled === 'boolean') {
      disabled = !state[id].disabled
    }

    Vue.set(state[id], 'disabled', disabled)
  }
} as MutationTree<ExchangesState>

export default {
  namespaced: true,
  getters,
  state,
  actions,
  mutations
} as Module<ExchangesState, ModulesState>
