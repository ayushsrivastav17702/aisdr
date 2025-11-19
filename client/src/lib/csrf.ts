let csrfToken: string | null = null;

export async function getCsrfToken(): Promise<string> {
  if (csrfToken) {
    return csrfToken;
  }

  try {
    const response = await fetch('/api/csrf-token', {
      credentials: 'include',
    });
    
    if (!response.ok) {
      throw new Error('Failed to fetch CSRF token');
    }
    
    const data = await response.json();
    csrfToken = data.csrfToken;
    return csrfToken;
  } catch (error) {
    console.error('CSRF token fetch error:', error);
    throw error;
  }
}

export function resetCsrfToken() {
  csrfToken = null;
}

export async function fetchWithCsrf(url: string, options: RequestInit = {}): Promise<Response> {
  const method = options.method?.toUpperCase() || 'GET';
  
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    const token = await getCsrfToken();
    
    options.headers = {
      ...options.headers,
      'x-csrf-token': token,
    };
  }
  
  return fetch(url, {
    ...options,
    credentials: 'include',
  });
}
