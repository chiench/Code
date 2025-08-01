import axiosConfig from '../axiosConfig'
const API = '/auth'

export const login = (data) => axiosConfig.post(`${API}/login`, data)
export const changePassword = (data) => axiosConfig.post(`${API}/change-password`, data)
