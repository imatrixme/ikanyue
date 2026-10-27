import { request } from './http'

export interface Venue {
  id: string
  name: string
  intro: string
  address: string
  openingHours: string
  phone: string
  bookable: boolean
  status: 'active' | 'inactive'
  sortOrder: number
}

export type VenueInput = Omit<Venue, 'id'>

export interface VenueOpsApi {
  listVenues(token: string): Promise<{ items: Venue[] }>
  createVenue(token: string, data: VenueInput): Promise<Venue>
  updateVenue(token: string, id: string, data: Partial<VenueInput>): Promise<Venue>
}

export function createHttpVenueOpsApi(baseUrl: string): VenueOpsApi {
  return {
    listVenues(token) {
      return request(`${baseUrl}/venues`, { token })
    },
    createVenue(token, data) {
      return request(`${baseUrl}/venues`, { method: 'POST', token, body: data })
    },
    updateVenue(token, id, data) {
      return request(`${baseUrl}/venues/${encodeURIComponent(id)}`, { method: 'POST', token, body: data })
    },
  }
}

export function createMockVenueOpsApi(): VenueOpsApi {
  const venues: Venue[] = [
    { id: 'venue_1', name: '看乐艺术', intro: '声乐课程与预约', address: '', openingHours: '', phone: '18521301857', bookable: true, status: 'active', sortOrder: 0 },
  ]
  return {
    async listVenues() {
      return { items: structuredClone([...venues].sort((a, b) => a.sortOrder - b.sortOrder)) }
    },
    async createVenue(_token, data) {
      const venue = { ...normalizeVenueInput(data), id: `venue_${venues.length + 1}` }
      venues.push(venue)
      return structuredClone(venue)
    },
    async updateVenue(_token, id, data) {
      const venue = venues.find((item) => item.id === id)
      if (!venue) throw new Error('场馆不存在')
      Object.assign(venue, normalizeVenueInput({ ...venue, ...data }))
      return structuredClone(venue)
    },
  }
}

function normalizeVenueInput(data: VenueInput): VenueInput {
  const name = data.name.trim()
  if (!name) throw new Error('场馆名称不能为空')
  return {
    address: data.address.trim(),
    bookable: data.bookable,
    intro: data.intro.trim(),
    name,
    openingHours: data.openingHours.trim(),
    phone: data.phone.trim(),
    sortOrder: Math.trunc(Number(data.sortOrder) || 0),
    status: data.status === 'inactive' ? 'inactive' : 'active',
  }
}
