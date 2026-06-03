/**
 * HTTP client for API requests
 */

import { getApiBaseUrl, getUserId } from "./config";

interface HttpResponse<T = any> {
  data: T;
  status: number;
}

export function authHeaders(): Record<string, string> {
  const uid = getUserId();
  return uid ? { "X-User-Id": uid } : {};
}

class HttpClient {
  private baseURL: string;

  constructor(baseURL?: string) {
    this.baseURL = baseURL ?? getApiBaseUrl();
  }

  async get<T = any>(url: string): Promise<T> {
    const response = await fetch(`${this.baseURL}${url}`, {
      headers: { ...authHeaders() },
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json();
  }

  async post<T = any>(url: string, data?: any): Promise<T> {
    const response = await fetch(`${this.baseURL}${url}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(),
      },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json();
  }

  /** 上传 FormData（不设 Content-Type，让浏览器自动处理 multipart/form-data boundary）。 */
  async uploadForm<T = any>(url: string, formData: FormData): Promise<T> {
    const response = await fetch(`${this.baseURL}${url}`, {
      method: "POST",
      headers: { ...authHeaders() },
      body: formData,
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json();
  }

  async put<T = any>(url: string, data?: any): Promise<T> {
    const response = await fetch(`${this.baseURL}${url}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(),
      },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json();
  }

  async delete<T = any>(url: string): Promise<T> {
    const response = await fetch(`${this.baseURL}${url}`, {
      method: "DELETE",
      headers: { ...authHeaders() },
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json();
  }
}

export const http = new HttpClient();
