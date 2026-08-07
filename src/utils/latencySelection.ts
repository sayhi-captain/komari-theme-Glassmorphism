import type { PingTaskInfo } from '@/utils/rpc'

export const HOME_LATENCY_SELECTION_STORAGE_KEY = 'komari-theme-glassmorphism:home-latency-task-ids:v1'
export const MAX_HOME_LATENCY_TASKS = 3
const CONFIG_TASK_SEPARATOR_REGEX = /[\s,，;；]+/u
const CONFIG_ALIAS_SEPARATOR_REGEX = /[,，;；\n]+/u

export function normalizeLatencyTaskType(task: PingTaskInfo): string {
  const type = task.type?.trim().toLowerCase()
  if (type === 'https')
    return 'HTTP'
  if (type === 'tcp' || type === 'tcping')
    return 'TCP'
  if (type === 'icmp' || type === 'ping')
    return 'ICMP'
  if (type === 'http')
    return 'HTTP'
  if (type)
    return type.toUpperCase()

  const name = task.name.trim().toLowerCase()
  if (name.includes('tcp'))
    return 'TCP'
  if (name.includes('http'))
    return 'HTTP'
  if (name.includes('icmp') || name.includes('ping'))
    return 'ICMP'
  return 'PING'
}

export function latencyTaskAppliesToNode(task: PingTaskInfo, uuid: string): boolean {
  const clients = Array.isArray(task.clients)
    ? task.clients.map(client => client.trim()).filter(Boolean)
    : []
  const normalizedUuid = uuid.trim()

  if (normalizedUuid && clients.includes(normalizedUuid))
    return true
  if (task.default_on === true)
    return true
  return clients.length === 0
}

export function latencyTaskLabel(task: PingTaskInfo): string {
  const type = normalizeLatencyTaskType(task)
  const name = task.name.trim() || `任务 ${task.id}`
  return `${name} · ${type}`
}

export function sortLatencyTasks(tasks: PingTaskInfo[]): PingTaskInfo[] {
  return [...tasks].sort((left, right) => {
    const weightDelta = (left.weight ?? 0) - (right.weight ?? 0)
    return weightDelta || left.id - right.id
  })
}

export function sanitizeLatencyTaskIds(value: unknown, tasks: PingTaskInfo[] = []): number[] {
  const knownIds = tasks.length ? new Set(tasks.map(task => task.id)) : null
  const values = Array.isArray(value) ? value : []
  const ids: number[] = []

  for (const item of values) {
    const id = typeof item === 'number' ? item : Number(item)
    if (!Number.isInteger(id) || id < 0 || (knownIds && !knownIds.has(id)) || ids.includes(id))
      continue
    ids.push(id)
    if (ids.length >= MAX_HOME_LATENCY_TASKS)
      break
  }

  return ids
}

export function parseConfiguredLatencyTaskIds(rawValue: unknown, tasks: PingTaskInfo[]): number[] {
  const byId = new Map(tasks.map(task => [String(task.id), task.id]))
  const byName = new Map(tasks.map(task => [task.name.trim().toLowerCase(), task.id]))
  const tokens = typeof rawValue === 'string'
    ? rawValue.split(CONFIG_TASK_SEPARATOR_REGEX).map(token => token.trim()).filter(Boolean)
    : []
  const ids: number[] = []

  for (const token of tokens) {
    const taskId = byId.get(token) ?? byName.get(token.toLowerCase())
    if (taskId === undefined || ids.includes(taskId))
      continue
    ids.push(taskId)
    if (ids.length >= MAX_HOME_LATENCY_TASKS)
      break
  }

  return ids
}

export function parseConfiguredLatencyAliases(rawValue: unknown): string[] {
  if (typeof rawValue !== 'string')
    return []
  return rawValue
    .split(CONFIG_ALIAS_SEPARATOR_REGEX)
    .map(alias => alias.trim().slice(0, 24))
}

export function readStoredLatencyTaskIds(): number[] | null {
  if (typeof window === 'undefined')
    return null

  try {
    const raw = window.localStorage.getItem(HOME_LATENCY_SELECTION_STORAGE_KEY)
    if (raw === null)
      return null
    return sanitizeLatencyTaskIds(JSON.parse(raw))
  }
  catch {
    return null
  }
}

export function writeStoredLatencyTaskIds(ids: number[]): void {
  if (typeof window === 'undefined')
    return

  try {
    window.localStorage.setItem(HOME_LATENCY_SELECTION_STORAGE_KEY, JSON.stringify(ids))
  }
  catch {
  }
}
