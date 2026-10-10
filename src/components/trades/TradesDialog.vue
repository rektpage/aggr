<template>
  <Dialog @clickOutside="close" class="pane-dialog" size="medium">
    <template v-slot:header>
      <div
        class="dialog__title -editable"
        v-text="name"
      ></div>
      <div class="column -center"></div>
    </template>
    <trades-settings :paneId="paneId" />
    <template v-slot:footer>
      <presets
        type="trades"
        :adapter="getPreset"
        :placeholder="paneId"
        @apply="resetPane($event)"
        class="-left -top"
        :class="{ '-rekt-locked-control': rektLocked }"
      />
    </template>
  </Dialog>
</template>

<script>
import DialogMixin from '../../mixins/dialogMixin'
import PaneDialogMixin from '../../mixins/paneDialogMixin'
import TradesSettings from './TradesSettings.vue'
import { rektPreset } from '@/services/rektPreset'

export default {
  components: { TradesSettings },
  computed: {
    // rekt.page: presets load other thresholds — locked while the app pins its defaults
    rektLocked() {
      return rektPreset.locked
    }
  },
  mixins: [DialogMixin, PaneDialogMixin]
}
</script>
