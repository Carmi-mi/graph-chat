import axios from 'axios';

const client = axios.create({
  baseURL: '',
  timeout: 120000,
  headers: {
    'Content-Type': 'application/json',
  },
});

client.interceptors.response.use(
  (response) => response.data,
  (error) => {
    const data = error.response?.data;
    const message = data?.error?.message || data?.message || error.message || 'Request failed';
    return Promise.reject(new Error(message));
  },
);

export default client;
