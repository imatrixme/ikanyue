export interface Course {
  slug: string
  title: string
  audience: string
  instrument: string
  description: string
  image: string
  schedule: string
}

export interface FacultyMember {
  slug: string
  name: string
  role: string
  specialties: string[]
  statement: string
  image: string
}

export interface LearnerStory {
  name: string
  identity: string
  quote: string
  course: string
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
