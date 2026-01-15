import request from "supertest";
import { API_BASE, authHeader } from "./test-utils";

export class ApiClient {
  private token: string | null = null;
  
  setToken(token: string) {
    this.token = token;
  }
  
  clearToken() {
    this.token = null;
  }
  
  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.token) {
      headers["Authorization"] = `Bearer ${this.token}`;
    }
    return headers;
  }
  
  async get(path: string, customHeaders?: Record<string, string>) {
    return request(API_BASE)
      .get(path)
      .set({ ...this.getHeaders(), ...customHeaders });
  }
  
  async post(path: string, body?: any, customHeaders?: Record<string, string>) {
    return request(API_BASE)
      .post(path)
      .set({ ...this.getHeaders(), ...customHeaders })
      .send(body);
  }
  
  async patch(path: string, body?: any, customHeaders?: Record<string, string>) {
    return request(API_BASE)
      .patch(path)
      .set({ ...this.getHeaders(), ...customHeaders })
      .send(body);
  }
  
  async put(path: string, body?: any, customHeaders?: Record<string, string>) {
    return request(API_BASE)
      .put(path)
      .set({ ...this.getHeaders(), ...customHeaders })
      .send(body);
  }
  
  async delete(path: string, customHeaders?: Record<string, string>) {
    return request(API_BASE)
      .delete(path)
      .set({ ...this.getHeaders(), ...customHeaders });
  }
}

export const apiClient = new ApiClient();

export async function login(email: string, password: string): Promise<{ token: string; userId: string } | null> {
  const response = await request(API_BASE)
    .post("/api/auth/login")
    .send({ email, password });
  
  if (response.status === 200 && response.body.token) {
    return {
      token: response.body.token,
      userId: response.body.userId,
    };
  }
  return null;
}

export async function logout(token: string): Promise<boolean> {
  const response = await request(API_BASE)
    .post("/api/auth/logout")
    .set(authHeader(token));
  
  return response.status === 200;
}

export async function callProtectedEndpoint(
  method: "get" | "post" | "patch" | "put" | "delete",
  path: string,
  token: string,
  body?: any
) {
  const req = request(API_BASE)[method](path).set(authHeader(token));
  
  if (body && method !== "get" && method !== "delete") {
    req.send(body);
  }
  
  return req;
}

export async function attemptRoleEscalation(token: string, targetRole: string) {
  return request(API_BASE)
    .post("/api/campaigns")
    .set(authHeader(token))
    .send({
      name: "Test Campaign",
      role: targetRole,
    });
}

export async function attemptCrossOrgAccess(token: string, targetOrgId: string) {
  return request(API_BASE)
    .get(`/api/organizations/${targetOrgId}/prospects`)
    .set(authHeader(token));
}
