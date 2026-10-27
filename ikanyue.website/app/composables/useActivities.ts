import { fallbackActivities } from '~/data/site'
import type { Activity } from '~/types/content'

interface ActivityResponse {
  items?: Activity[]
}

export function useActivities() {
  const request = useFetch<ActivityResponse>('/api/activities', {
    key: 'public-activities',
    default: () => ({ items: [] }),
  })

  const activities = computed(() => {
    const items = request.data.value?.items || []
    return items.length ? items : fallbackActivities
  })

  return {
    ...request,
    activities,
    usingFallback: computed(() => Boolean(request.error.value) || !request.data.value?.items?.length),
  }
}

export function useActivity(id: MaybeRefOrGetter<string>) {
  const activityId = computed(() => toValue(id))
  const request = useFetch<Activity>(
    () => `/api/activities/${encodeURIComponent(activityId.value)}`,
    { key: () => `public-activity-${activityId.value}` },
  )
  const activity = computed(() => request.data.value || fallbackActivities.find(item => item.id === activityId.value) || null)

  return {
    ...request,
    activity,
  }
}
