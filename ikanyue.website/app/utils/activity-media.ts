import type { Activity } from '~/types/content'

const activityPhotography: Readonly<Record<string, string>> = {
  c3e3r8gdk5mmim7: '/images/activity-high-note-session-2.webp',
  ck8wk6h9ks40u41: '/images/activity-high-note-session-1.webp',
  '702xy10zax9yg69': '/images/vocal-performance.webp',
}

export function resolveActivityImage(activity: Pick<Activity, 'id' | 'coverImageUrl' | 'coverImage'>) {
  return activityPhotography[activity.id]
    || activity.coverImageUrl
    || activity.coverImage
    || '/images/vocal-performance.webp'
}
