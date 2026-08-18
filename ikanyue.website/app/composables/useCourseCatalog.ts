import type {
  PublicCourseCatalog,
  PublicCourseDetail,
  PublicCoursePackage,
} from '~/types/content'

export function useCourseCatalog() {
  const request = useFetch<PublicCourseCatalog>('/api/courses', {
    key: 'public-course-catalog',
    default: () => ({ courses: [], packages: [] }),
  })
  return { ...request, catalog: computed(() => request.data.value || { courses: [], packages: [] }) }
}

export function usePublicCourse(code: MaybeRefOrGetter<string>) {
  const courseCode = computed(() => toValue(code))
  const request = useFetch<PublicCourseDetail>(
    () => `/api/courses/${encodeURIComponent(courseCode.value)}`,
    { key: () => `public-course-${courseCode.value}` },
  )
  return { ...request, course: computed(() => request.data.value || null) }
}

export function usePublicPackage(code: MaybeRefOrGetter<string>) {
  const packageCode = computed(() => toValue(code))
  const request = useFetch<PublicCoursePackage>(
    () => `/api/packages/${encodeURIComponent(packageCode.value)}`,
    { key: () => `public-package-${packageCode.value}` },
  )
  return { ...request, coursePackage: computed(() => request.data.value || null) }
}
