<template>
  <div class="pane-chart">
    <pane-header
      ref="paneHeader"
      :paneId="paneId"
      :settings="() => import('@/components/chart/ChartDialog.vue')"
    >
      <template v-slot:menu>
        <button type="button" class="dropdown-item" @click="toggleLayout">
          <i class="icon-resize-height"></i>
          <span>Arrange</span>
        </button>
        <button type="button" class="dropdown-item" @click="restart">
          <i class="icon-refresh"></i>
          <span>Restart</span>
        </button>
        <button type="button" class="dropdown-item" @click="takeScreenshot">
          <i class="icon-add-photo"></i>
          <span>Snapshot</span>
        </button>
      </template>
      <!-- liquidation-terminal: the embedding app owns the timeframe control -->
      <hr />
    </pane-header>
    <div
      class="chart-overlay hide-scrollbar"
      :style="{ left: overlayLeft + 'px' }"
    >
      <indicators-overlay v-model="showIndicators" :pane-id="paneId" />
      <markets-overlay :pane-id="paneId" />
    </div>

    <chart-layout
      v-if="layouting"
      :pane-id="paneId"
      :layouting="layouting"
      :axis="axis"
    ></chart-layout>

    <div class="chart__container" ref="chartContainer"></div>
    <!--
      rekt.page (2026-10-10): the time in the chart's timezone, in the empty corner under the price
      scale. Clicking it asks the embedding app to open its timezone menu.
    -->
    <button
      v-if="embedded"
      type="button"
      class="chart-clock"
      ref="clock"
      :style="{ width: clockWidth + 'px', bottom: clockBottom + 'px', '--clock-bg': clockBg }"
      @click="openClock"
    >
      {{ clockText }}
    </button>
  </div>
</template>

<script lang="ts">
import { Component, Mixins } from 'vue-property-decorator'

import Chart from './chart'

import { getTimeframeForHuman, sleep } from '@/utils/helpers'
import { ChartPaneState } from '@/store/panesSettings/chart'

import aggregatorService from '@/services/aggregatorService'
import { AlertEvent } from '@/services/alertService'

import PaneMixin from '@/mixins/paneMixin'
import PaneHeader from '@/components/panes/PaneHeader.vue'
import ChartLayout from '@/components/chart/Layout.vue'
import IndicatorsOverlay from '@/components/chart/IndicatorsOverlay.vue'
import MarketsOverlay from '@/components/chart/MarketsOverlay.vue'
import AlertsList from '@/components/alerts/AlertsList.vue'
import iframeService from '@/services/iframeService'
import Btn from '@/components/framework/Btn.vue'

import { Trade } from '@/types/types'

@Component({
  name: 'Chart',
  components: {
    ChartLayout,
    PaneHeader,
    IndicatorsOverlay,
    MarketsOverlay,
    AlertsList,
    Btn
  }
})
export default class ChartComponent extends Mixins(PaneMixin) {
  axis = {
    top: 0,
    left: 0,
    right: 0,
    time: 0
  }

  private chart: Chart

  embedded = Boolean(iframeService)
  clockText = ''
  clockWidth = 64
  clockBottom = 28
  clockBg = ''
  private _clockTimer: number

  /** HH:MM:SS in the chart's timezone (the offset the chart already applies to its time axis) */
  updateClock() {
    const offset = this.$store.state.settings.timezoneOffset || 0
    this.clockText = new Date(Date.now() + offset).toISOString().slice(11, 19)
    try {
      const width = this.chart?.chartInstance?.priceScale('right').width()
      // bottom cell of the price scale, right above the time axis (clear of the widget's resize handle in
      // the corner); the opaque background hides the price labels that would land under it
      if (width > 0) this.clockWidth = width
      const timeAxis = this.chart.chartInstance.timeScale().height()
      // the axis canvases are transparent: what shows there is the pane's (partly translucent) backgrounds
      // stacked up to the first opaque one — blend them into one solid colour
      const layers: number[][] = []
      let el: HTMLElement = this.$refs.chartContainer
      while (el) {
        const m = getComputedStyle(el).backgroundColor.match(/[\d.]+/g)
        if (m && m.length >= 3) {
          const alpha = m.length > 3 ? +m[3] : 1
          if (alpha > 0) layers.push([+m[0], +m[1], +m[2], alpha])
          if (alpha >= 1) break
        }
        el = el.parentElement
      }
      if (layers.length) {
        let rgb = [0, 0, 0]
        for (const [r, g, b, alpha] of layers.reverse()) rgb = [r, g, b].map((c, i) => c * alpha + rgb[i] * (1 - alpha))
        this.clockBg = 'rgb(' + rgb.map(Math.round).join(',') + ')'
      }
      if (timeAxis > 0) this.clockBottom = timeAxis
    } catch {
      // chart not built yet
    }
  }

  openClock() {
    const rect = (this.$refs as any).clock.getBoundingClientRect()
    iframeService.send('clock', { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom })
  }

  get layouting() {
    this.refreshAxisSize()
    return (this.$store.state[this.paneId] as ChartPaneState).layouting
  }

  get overlayLeft() {
    return this.axis.left
  }

  get overlayTop() {
    return this.axis.top
  }

  get timeframe() {
    return this.$store.state[this.paneId].timeframe
  }

  get showIndicators() {
    return this.$store.state[this.paneId].showIndicators
  }

  set showIndicators(value) {
    this.$store.commit(`${this.paneId}/TOGGLE_INDICATORS`, value)
  }

  get timeframeForHuman() {
    if (!this.timeframe) {
      return 'ERR'
    }

    return getTimeframeForHuman(this.timeframe)
  }

  $refs!: {
    chartContainer: HTMLElement
    paneHeader: PaneHeader
  }

  mounted() {
    this.chart = new Chart(this.paneId, this.$refs.chartContainer)

    this.updateClock()
    this._clockTimer = window.setInterval(() => this.updateClock(), 1000)

    this.bindAggregator()

    if (this.showIndicators && this.$parent.$el.clientHeight > 420) {
      this.showIndicators = true
    }
  }

  destroyChart() {
    this.unbindAggregator()

    this.chart.destroy()
  }

  beforeDestroy() {
    clearInterval(this._clockTimer)
    this.destroyChart()
  }

  onTrades(trades: Trade[]) {
    this.chart.queueTrades(trades)
  }

  onAlert(alertEvent: AlertEvent) {
    this.chart.onAlert(alertEvent)
  }

  bindAggregator() {
    aggregatorService.on('trades', this.onTrades)
    aggregatorService.on('alert', this.onAlert)
  }

  unbindAggregator() {
    aggregatorService.off('trades', this.onTrades)
    aggregatorService.off('alert', this.onAlert)
  }

  renderChart() {
    this.chart.renderAll()
  }

  onResize() {
    if (!this.chart) {
      return
    }

    this.chart.refreshChartDimensions()
    this.chart.updateFontSize()
    this.refreshAxisSize()
  }

  async refreshAxisSize() {
    if (!this.$refs.chartContainer) {
      return
    }

    await sleep(100)

    this.axis = this.chart.getAxisSize()
  }

  toggleLayout() {
    this.$store.commit(this.paneId + '/TOGGLE_LAYOUTING')
  }

  restart() {
    this.chart.restart()
  }

  takeScreenshot(event) {
    this.chart.takeScreenshot(event)
  }

}
</script>

<style lang="scss" scoped>
.pane-chart {
  font-family: $font-condensed;

  &:hover .chart-overlay {
    display: flex;
  }

}

// rekt.page: clock in the corner under the price scale
.chart-clock {
  position: absolute;
  right: 0;
  z-index: 3;
  height: 24px;
  padding: 0;
  background: var(--clock-bg);

  // solid band above the clock: price labels disappear at its top edge, as if slid under it
  &::before {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    bottom: 100%;
    height: 26px;
    background: var(--clock-bg);
    pointer-events: none;
  }
  border: 0;
  color: var(--theme-color-base);
  font-family: $font-monospace;
  font-size: 12px;
  text-align: center;
  cursor: pointer;

  // no opacity on the box itself: it must hide the price labels under it completely
  &:hover {
    color: var(--theme-color-100);
  }
}

.chart__container {
  position: relative;
  width: 100%;
  flex-grow: 1;

  -webkit-touch-callout: none;
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
  user-select: none;
}

body.-unselectable .chart-overlay {
  display: none !important;
}
</style>
