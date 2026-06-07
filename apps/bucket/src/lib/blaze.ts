import { createBlazeClient } from '@nublestation/blaze'
import { schema } from '../schema'

const BASE_URL = (import.meta.env.VITE_NUBLESTATION_URL as string) || 'http://api.nuble.local'
const API_KEY  = (import.meta.env.VITE_NUBLESTATION_API_KEY as string) || ''

export const nuble = createBlazeClient({ baseUrl: BASE_URL, apiKey: API_KEY, schema })
