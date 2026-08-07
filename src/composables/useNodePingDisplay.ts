import type { MaybeRefOrGetter } from 'vue'
import { computed, toValue } from 'vue'
import { useLatencyTaskSelection } from '@/composables/useLatencyTaskSelection'
import { useNodePingStats } from '@/composables/useNodePingStats'
import { PING_SUMMARY_MAX_COUNT } from '@/constants/load'
import { useAppStore } from '@/stores/app'
import { formatDateTime } from '@/utils/helper'
import { normalizeLatencyTaskType } from '@/utils/latencySelection'

export type NodePingMetric = 'latency' | 'loss'

export interface NodePingBar {
  key: string
  className: string
  tooltip: string
}

interface UseNodePingDisplayOptions {
  enabled?: MaybeRefOrGetter<boolean>
  loadingDisplayText?: string
  emptyDisplayText?: string
  loadingPanelTooltipText?: Partial<Record<NodePingMetric, string>>
  emptyPanelTooltipText?: Partial<Record<NodePingMetric, string>>
}

const EMPTY_PING_BAR_COUNT = 20
const TASK_COLOR_CLASSES = [
  'bg-rose-400',
  'bg-blue-400',
  'bg-emerald-400',
  'bg-amber-400',
  'bg-violet-400',
] as const

function getLatencyToneClass(latency: number): string {
  if (latency <= 60)
    return 'bg-signal-1'
  if (latency <= 100)
    return 'bg-signal-2'
  if (latency <= 160)
    return 'bg-signal-3 ping-signal-pattern-2'
  if (latency <= 200)
    return 'bg-signal-4 ping-signal-pattern-3'
  return 'bg-signal-5 ping-signal-pattern-4'
}

function getLossToneClass(loss: number): string {
  if (loss <= 1)
    return 'bg-signal-1'
  if (loss <= 3)
    return 'bg-signal-2'
  if (loss <= 6)
    return 'bg-signal-3 ping-signal-pattern-2'
  if (loss <= 9)
    return 'bg-signal-4 ping-signal-pattern-3'
  return 'bg-signal-5 ping-signal-pattern-4'
}

export function useNodePingDisplay(
  uuid: MaybeRefOrGetter<string>,
  options: UseNodePingDisplayOptions = {},
) {
  const appStore = useAppStore()
  const latencySelection = useLatencyTaskSelection()

  const pingStatsEnabled = computed(() => {
    if (toValue(options.enabled) === false)
      return false
    if (appStore.publicSettings?.record_enabled === false)
      return false
    return appStore.publicSettings?.ping_record_preserve_time !== 0
  })

  const pingStatsHours = computed(() => {
    const preserveTime = appStore.publicSettings?.ping_record_preserve_time
    if (typeof preserveTime === 'number' && preserveTime > 0)
      return Math.min(preserveTime, 4)
    return 4
  })

  const pingStats = useNodePingStats(uuid, {
    hours: pingStatsHours,
    enabled: pingStatsEnabled,
    maxCount: PING_SUMMARY_MAX_COUNT,
    taskIds: latencySelection.selectedTaskIds,
  })

  function buildPingBars(metric: NodePingMetric, history = pingStats.history.value): NodePingBar[] {
    const points = history
    if (!points.length)
      return []

    return points.map((point, index) => {
      const value = point[metric]

      return {
        key: `${point.time}-${index}`,
        className: value === null
          ? 'bg-muted-foreground/15'
          : metric === 'latency'
            ? getLatencyToneClass(value)
            : getLossToneClass(value),
        tooltip: value === null
          ? `${formatDateTime(point.time, 'HH:mm:ss')}\n无采样数据`
          : metric === 'latency'
            ? `${formatDateTime(point.time, 'HH:mm:ss')}\n${Math.round(value)} ms`
            : `${formatDateTime(point.time, 'HH:mm:ss')}\n${value.toFixed(1)}%`,
      }
    })
  }

  function buildEmptyPingBars(metric: NodePingMetric): NodePingBar[] {
    const tooltip = pingStats.loading.value
      ? '加载中'
      : pingStats.error.value
        ? '加载失败'
        : !pingStatsEnabled.value
            ? '未启用记录'
            : metric === 'latency'
              ? '无采样数据'
              : '无采样数据'

    return Array.from({ length: EMPTY_PING_BAR_COUNT }, (_, index) => ({
      key: `${metric}-empty-${index}`,
      className: 'bg-muted-foreground/10',
      tooltip,
    }))
  }

  const latencyBars = computed(() => buildPingBars('latency'))
  const lossBars = computed(() => buildPingBars('loss'))
  const latencyRenderBars = computed(() => latencyBars.value.length ? latencyBars.value : buildEmptyPingBars('latency'))
  const lossRenderBars = computed(() => lossBars.value.length ? lossBars.value : buildEmptyPingBars('loss'))

  const latencyDisplay = computed(() => {
    if (pingStats.hasData.value)
      return `${Math.round(pingStats.avgLatency.value)} ms`
    if (pingStats.loading.value)
      return options.loadingDisplayText ?? '加载中'
    return options.emptyDisplayText ?? '-'
  })

  const lossDisplay = computed(() => {
    if (pingStats.hasData.value)
      return `${pingStats.avgLoss.value.toFixed(1)}%`
    if (pingStats.loading.value)
      return options.loadingDisplayText ?? '加载中'
    return options.emptyDisplayText ?? '-'
  })

  const latencyPanelTooltip = computed(() => {
    if (!pingStats.hasData.value) {
      if (pingStats.loading.value)
        return options.loadingPanelTooltipText?.latency ?? ''
      return options.emptyPanelTooltipText?.latency ?? ''
    }
    return `平均延迟 ${Math.round(pingStats.avgLatency.value)} ms`
  })

  const lossPanelTooltip = computed(() => {
    if (!pingStats.hasData.value) {
      if (pingStats.loading.value)
        return options.loadingPanelTooltipText?.loss ?? ''
      return options.emptyPanelTooltipText?.loss ?? ''
    }

    const volatility = pingStats.avgVolatility.value > 0
      ? `，平均波动 ${pingStats.avgVolatility.value.toFixed(2)}`
      : ''
    return `平均丢包 ${pingStats.avgLoss.value.toFixed(1)}%${volatility}${latencySelection.hasExplicitSelection.value ? '（自选任务）' : ''}`
  })

  const selectedTaskLabel = computed(() => {
    if (!latencySelection.hasExplicitSelection.value)
      return '全部任务'
    const selected = new Set(latencySelection.selectedTaskIds.value ?? [])
    const names = latencySelection.tasks.value
      .filter(task => selected.has(task.id))
      .map(task => latencySelection.taskLabel(task.id, task.name.trim() || `任务 ${task.id}`))
    return names.length ? names.join('、') : '未选择任务'
  })

  const showLatencyPanel = computed(() => latencySelection.selectedTaskIds.value === undefined || latencySelection.selectedTaskIds.value.length > 0)

  const taskDisplays = computed(() => {
    if (!latencySelection.hasExplicitSelection.value)
      return []

    const statsByTaskId = new Map(pingStats.tasks.value.map(task => [task.taskId, task]))
    const taskById = new Map(latencySelection.tasks.value.map(task => [task.id, task]))
    return (latencySelection.selectedTaskIds.value ?? []).map((taskId, index) => {
      const taskStats = statsByTaskId.get(taskId)
      const task = taskById.get(taskId)
      const latencyBars = taskStats?.history?.length ? buildPingBars('latency', taskStats.history) : buildEmptyPingBars('latency')
      const lossBars = taskStats?.history?.length ? buildPingBars('loss', taskStats.history) : buildEmptyPingBars('loss')
      return {
        taskId,
        label: latencySelection.taskLabel(taskId, task?.name?.trim() || `任务 ${taskId}`),
        typeLabel: task ? normalizeLatencyTaskType(task) : 'PING',
        dotClass: TASK_COLOR_CLASSES[index % TASK_COLOR_CLASSES.length],
        latencyDisplay: taskStats?.hasData ? `${Math.round(taskStats.avgLatency)} ms` : pingStats.loading.value ? '加载中' : '-',
        lossDisplay: taskStats?.hasData ? `${taskStats.avgLoss.toFixed(1)}%` : pingStats.loading.value ? '加载中' : '-',
        latencyBars,
        lossBars,
      }
    })
  })

  const taskPanelTitle = computed(() => {
    const types = new Set(taskDisplays.value.map(task => task.typeLabel))
    if (types.size === 1 && types.has('TCP'))
      return 'TCPing'
    if (types.size === 1 && types.has('ICMP'))
      return 'Ping'
    if (types.size === 1 && types.has('HTTP'))
      return 'HTTP'
    return '延迟监测'
  })

  return {
    pingStats,
    pingStatsEnabled,
    pingStatsHours,
    latencyRenderBars,
    lossRenderBars,
    latencyDisplay,
    lossDisplay,
    latencyPanelTooltip,
    lossPanelTooltip,
    selectedTaskLabel,
    showLatencyPanel,
    taskDisplays,
    taskPanelTitle,
  }
}
