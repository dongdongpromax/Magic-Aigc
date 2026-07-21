import axios from 'axios'
import { getDefaultAppConfig } from '@/config/env'

const config = getDefaultAppConfig()

export const backendClient = axios.create({
  baseURL: config.baseURL,
  timeout: config.timeout,
})
