<script setup lang="ts">
import type { PingTaskInfo } from '@/utils/rpc'
import { computed, ref, watch } from 'vue'
import { AppDialog } from '@/components/ui/app-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { latencyTaskLabel, MAX_HOME_LATENCY_TASKS } from '@/utils/latencySelection'

const props = defineProps<{
  open: boolean
  tasks: PingTaskInfo[]
  selectedTaskIds?: number[]
  loading?: boolean
  error?: string | null
}>()

const emit = defineEmits<{
  'update:open': [open: boolean]
  'save': [ids: number[]]
  'reset': []
}>()

const draft = ref<number[]>([])
const search = ref('')

watch(() => [props.open, props.selectedTaskIds] as const, ([open]) => {
  if (!open)
    return
  draft.value = [...(props.selectedTaskIds ?? [])]
  search.value = ''
}, { immediate: true })

const filteredTasks = computed(() => {
  const keyword = search.value.trim().toLowerCase()
  if (!keyword)
    return props.tasks
  return props.tasks.filter(task => latencyTaskLabel(task).toLowerCase().includes(keyword))
})

function toggleTask(taskId: number): void {
  if (draft.value.includes(taskId)) {
    draft.value = draft.value.filter(id => id !== taskId)
    return
  }
  if (draft.value.length >= MAX_HOME_LATENCY_TASKS)
    return
  draft.value = [...draft.value, taskId]
}

function save(): void {
  emit('save', draft.value)
  emit('update:open', false)
}
</script>

<template>
  <AppDialog
    :open="open"
    title="首页自选延迟"
    description="从 Komari 已创建的 Ping 任务中选择 0～3 项；选择保存在当前浏览器。"
    content-class="max-w-2xl"
    @update:open="emit('update:open', $event)"
  >
    <div class="flex flex-col gap-4">
      <div class="flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        <span>已选择 <strong class="text-foreground">{{ draft.length }}/{{ MAX_HOME_LATENCY_TASKS }}</strong></span>
        <span v-if="draft.length === 0">保存 0 项会隐藏首页延迟模块</span>
        <span v-else>卡片只汇总所选任务，不跨任务混合展示</span>
      </div>

      <Input v-model="search" placeholder="搜索任务名称或协议" aria-label="搜索延迟任务" />

      <div v-if="loading" class="py-8 text-center text-sm text-muted-foreground">
        正在读取延迟任务…
      </div>
      <div v-else-if="error" class="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
        {{ error }}
      </div>
      <div v-else-if="!tasks.length" class="py-8 text-center text-sm text-muted-foreground">
        当前 Komari 没有可用的公开延迟任务。
      </div>
      <div v-else class="grid gap-2 sm:grid-cols-2">
        <button
          v-for="task in filteredTasks"
          :key="task.id"
          type="button"
          class="flex min-w-0 items-center gap-3 rounded-md border border-border/60 bg-background/30 px-3 py-2 text-left transition-colors hover:bg-background/70"
          :class="draft.includes(task.id) && 'border-primary/60 bg-primary/10'"
          :aria-pressed="draft.includes(task.id)"
          @click="toggleTask(task.id)"
        >
          <span class="flex size-5 shrink-0 items-center justify-center rounded border border-border/70 text-xs" :class="draft.includes(task.id) && 'bg-primary text-primary-foreground'">
            {{ draft.includes(task.id) ? '✓' : '' }}
          </span>
          <span class="min-w-0">
            <span class="block truncate text-sm">{{ task.name || `任务 ${task.id}` }}</span>
            <span class="block text-[11px] text-muted-foreground">{{ task.type?.toUpperCase() || 'PING' }} · #{{ task.id }}</span>
          </span>
        </button>
      </div>

      <div class="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-4">
        <Button variant="ghost" size="sm" @click="emit('reset'); emit('update:open', false)">
          恢复后台默认
        </Button>
        <div class="flex gap-2">
          <Button variant="outline" size="sm" @click="emit('update:open', false)">
            取消
          </Button>
          <Button size="sm" @click="save">
            保存选择
          </Button>
        </div>
      </div>
    </div>
  </AppDialog>
</template>
