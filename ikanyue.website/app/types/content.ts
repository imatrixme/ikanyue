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
  startTime: string | number
  endTime?: string | number
  location?: string
  coverImageUrl?: string
  coverImage?: string
  price?: number
  tags?: string | string[]
  externalLink?: string
}
