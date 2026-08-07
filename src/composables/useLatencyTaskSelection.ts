import type { ComputedRef, Ref } from 'vue'
import type { PingTaskInfo } from '@/utils/rpc'
import { computed, onMounted, ref, shallowRef } from 'vue'
import { loadPublicPingTasks } from '@/services/metrics.service'
import { useAppStore } from '@/stores/app'
import {
  HOME_LATENCY_SELECTION_STORAGE_KEY,
  MAX_HOME_LATENCY_TASKS,
  parseConfiguredLatencyAliases,
  parseConfiguredLatencyTaskIds,
  readStoredLatencyTaskIds,
  sanitizeLatencyTaskIds,
  sortLatencyTasks,
  writeStoredLatencyTaskIds,
} from '@/utils/latencySelection'

const tasks = shallowRef<PingTaskInfo[]>([])
const selectedTaskIds = ref<number[] | null>(null)
const configuredAliases = shallowRef<Record<number, string>>({})
const usingConfiguredDefaults = ref(false)
const loading = ref(false)
const error = ref<string | null>(null)
let loadPromise: Promise<void> | null = null
let initialized = false

function initializeStoredSelection(): void {
  if (initialized)
    return
  initialized = true
  selectedTaskIds.value = readStoredLatencyTaskIds()
}

function applyConfiguredDefaults(appStore: ReturnType<typeof useAppStore>): void {
  const ids = parseConfiguredLatencyTaskIds(appStore.latencyDefaultTasks, tasks.value)
  const aliases = parseConfiguredLatencyAliases(appStore.latencyDefaultAliases)
  configuredAliases.value = Object.fromEntries(ids.map((taskId, index) => [taskId, aliases[index] || '']))
  selectedTaskIds.value = ids.length ? ids : null
  usingConfiguredDefaults.value = ids.length > 0
}

export function useLatencyTaskSelection(): {
  tasks: Readonly<Ref<PingTaskInfo[]>>
  selectedTaskIds: ComputedRef<number[] | undefined>
  selectedTaskCount: ComputedRef<number | null>
  hasExplicitSelection: ComputedRef<boolean>
  loading: Readonly<Ref<boolean>>
  error: Readonly<Ref<string | null>>
  loadTasks: () => Promise<void>
  setSelectedTaskIds: (ids: number[]) => void
  resetSelectedTaskIds: () => void
  taskLabel: (taskId: number, fallback: string) => string
} {
  const appStore = useAppStore()
  initializeStoredSelection()

  async function loadTasks(): Promise<void> {
    if (loadPromise)
      return loadPromise
    if (tasks.value.length)
      return

    loading.value = true
    error.value = null
    loadPromise = loadPublicPingTasks()
      .then((result) => {
        tasks.value = sortLatencyTasks(result)
        if (selectedTaskIds.value !== null)
          selectedTaskIds.value = sanitizeLatencyTaskIds(selectedTaskIds.value, tasks.value)
        else
          applyConfiguredDefaults(appStore)
      })
      .catch((reason: unknown) => {
        error.value = reason instanceof Error ? reason.message : '获取延迟任务失败'
      })
      .finally(() => {
        loading.value = false
        loadPromise = null
      })

    return loadPromise
  }

  function setSelectedTaskIds(ids: number[]): void {
    const next = sanitizeLatencyTaskIds(ids, tasks.value)
    if (next.length > MAX_HOME_LATENCY_TASKS)
      return
    selectedTaskIds.value = next
    usingConfiguredDefaults.value = false
    configuredAliases.value = {}
    writeStoredLatencyTaskIds(next)
  }

  function resetSelectedTaskIds(): void {
    if (typeof window !== 'undefined')
      window.localStorage.removeItem(HOME_LATENCY_SELECTION_STORAGE_KEY)
    applyConfiguredDefaults(appStore)
  }

  onMounted(() => {
    void loadTasks()
  })

  return {
    tasks,
    selectedTaskIds: computed(() => !appStore.latencyPickerEnabled || selectedTaskIds.value === null ? undefined : selectedTaskIds.value),
    selectedTaskCount: computed(() => !appStore.latencyPickerEnabled ? null : selectedTaskIds.value?.length ?? null),
    hasExplicitSelection: computed(() => appStore.latencyPickerEnabled && selectedTaskIds.value !== null),
    loading,
    error,
    loadTasks,
    setSelectedTaskIds,
    resetSelectedTaskIds,
    taskLabel: (taskId: number, fallback: string) => usingConfiguredDefaults.value && configuredAliases.value[taskId] ? configuredAliases.value[taskId]! : fallback,
  }
}
