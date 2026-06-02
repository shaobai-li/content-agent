/**
 * HTTP client for API requests
 */

import { API_BASE_URL, getUserId } from "./config";

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

  constructor(baseURL: string = API_BASE_URL) {
    this.baseURL = baseURL;
  }

  private async _handleResponse<T>(response: Response): Promise<T> {
    if (!response.ok) {
      let detail = `HTTP ${response.status}`;
      try {
        const body = await response.json();
        if (body && body.detail) {
          detail = body.detail;
        }
      } catch { /* ignore parse errors */ }
      throw new Error(detail);
    }
    return response.json();
  }

  async get<T = any>(url: string): Promise<T> {
    const response = await fetch(`${this.baseURL}${url}`, {
      headers: { ...authHeaders() },
    });
    return this._handleResponse<T>(response);
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
    return this._handleResponse<T>(response);
  }

  /** 上传 FormData（不设 Content-Type，让浏览器自动处理 multipart/form-data boundary）。 */
  async uploadForm<T = any>(url: string, formData: FormData): Promise<T> {
    const response = await fetch(`${this.baseURL}${url}`, {
      method: "POST",
      headers: { ...authHeaders() },
      body: formData,
    });
    return this._handleResponse<T>(response);
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
    return this._handleResponse<T>(response);
  }

  async delete<T = any>(url: string): Promise<T> {
    const response = await fetch(`${this.baseURL}${url}`, {
      headers: { ...authHeaders() },
    });
    return this._handleResponse<T>(response);
  }
}

export const http = new HttpClient();
