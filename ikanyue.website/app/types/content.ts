export interface Course {
  slug: string
  title: string
  audience: string
  focus: string
  description: string
  image: string
  imageAlt: string
  schedule: string
}

export interface TeachingRole {
  slug: string
  title: string
  audience: string
  specialties: string[]
  statement: string
  image: string
  imageAlt: string
}

export interface LearnerJourney {
  stage: string
  title: string
  profile: string
  summary: string
  milestones: string[]
  image: string
  imageAlt: string
}

export interface Activity {
  id: string
  title: string
  description?: string
  descriptionHtml?: string
  summary?: string
  startTime: string | number
  endTime?: string | number
  location?: string
  coverImageUrl?: string
  coverImage?: string
  price?: number
  tags?: string | string[]
  externalLink?: string
}

export interface PublicCourseSpec {
  code: string
  deliveryMode: string
  durationMinutes: number
  name: string
  packageCodes: string[]
  teacherTier: string
}

export interface PublicPackageGrant {
  courseCode: string | null
  courseName: string | null
  creditName: string
  quantity: number
  unitLabel: string
}

export interface PublicCoursePackage {
  code: string
  description: string
  grants: PublicPackageGrant[]
  name: string
  price: {
    currency: string
    listAmount: number
    saleAmount: number
  }
  purchaseMode: 'contact' | 'mini_program'
  validity: {
    activationDeadlineDays: number | null
    activationMode: string
    expiryPolicy: string
    validityDurationDays: number | null
  }
}

export interface PublicCourseCatalog {
  courses: PublicCourseSpec[]
  packages: PublicCoursePackage[]
}

export interface PublicCourseDetail extends PublicCourseSpec {
  packages: PublicCoursePackage[]
}
