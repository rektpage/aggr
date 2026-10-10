import Vue from 'vue'
import App from './App.vue'
import VueTippy, { TippyComponent } from 'vue-tippy'
// liquidation-terminal: fonts bundled instead of loaded from Google Fonts
import '@fontsource/barlow-semi-condensed/400.css'
import '@fontsource/barlow-semi-condensed/700.css'
import '@fontsource/spline-sans-mono/400.css'
import '@fontsource/spline-sans-mono/500.css'
import '@fontsource/spline-sans-mono/600.css'
import './assets/sass/app.scss'
import store from './store'

/*
 * rekt.page (2026-10-10): after a deploy the page that is already open still runs the old build, and the
 * dialogs it loads on demand (chart / trades settings) point at chunk files the new deploy removed. The
 * import then fails and the dialog spins forever. Reload to the latest build instead: inside the
 * terminal ask the embedding app (it reloads the whole page), standalone reload this one.
 */
let staleReported = false
const reportStale = () => {
  if (staleReported) return
  staleReported = true
  if (window.parent !== window) window.parent.postMessage(JSON.stringify({ op: 'stale' }), location.origin === 'null' ? '*' : location.origin)
  else window.location.reload()
}
window.addEventListener('vite:preloadError', event => {
  event.preventDefault()
  reportStale()
})
window.addEventListener('unhandledrejection', event => {
  const message = String((event.reason && event.reason.message) || event.reason || '')
  if (/dynamically imported module|Importing a module script failed|error loading dynamically imported/i.test(message)) reportStale()
})

import Editable from '@/components/framework/Editable.vue'
import DropdownComponent from '@/components/framework/Dropdown.vue'
import Presets from '@/components/framework/Presets.vue'
import autofocus from '@/directives/autofocusDirective'
import draggableMarket from '@/directives/draggableMarketDirective'

Vue.use(VueTippy, {
  maxWidth: '200px',
  duration: 0,
  arrow: true,
  animation: 'none',
  delay: [200, 0],
  animateFill: false,
  theme: 'dark',
  boundary: 'window',
  distance: 24
})

/* eslint-disable vue/multi-word-component-names */
Vue.component('tippy', TippyComponent)
Vue.component('dropdown', DropdownComponent)
Vue.component('editable', Editable)
Vue.component('presets', Presets)
Vue.directive('autofocus', autofocus)
Vue.directive('draggable-market', draggableMarket)

// rekt.page (2026-10-10): this copy only runs inside the rekt.page terminal. Opened on its own
// (app.rekt.page/aggr/) it would hand out the whole chart without the app's sign-in, so it shows a
// pointer to the app instead. This is a front door, not a lock — aggr is open source and its data is
// public; what the license protects lives on the rekt.page API. Development builds stay standalone.
const embedded = (() => {
  try {
    return window.top !== window.self
  } catch {
    return true
  }
})()

if (!embedded && !import.meta.env.DEV) {
  document.title = 'rekt.page'
  document.body.innerHTML =
    '<div style="display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#07090d;color:#c9d4ea;font:16px/1.6 sans-serif;text-align:center">' +
    '<div><p style="margin:0 0 12px">This chart runs inside the rekt.page terminal.</p>' +
    '<a href="https://app.rekt.page" style="color:#97fce4">Open rekt.page</a></div></div>'
  throw new Error('rekt.page: aggr must run inside the rekt.page app')
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const base_url = import.meta.env.VITE_APP_BASE_PATH || '/'
    navigator.serviceWorker.register(`${base_url}sw.js`)
  })
}

new Vue({
  el: '#app',
  store,
  render: h => h(App)
})
