// Mission Control v3 - API Client
// Handles all API communication with error handling and retries

class APIClient {
  constructor(baseURL = '/api') {
    this.baseURL = baseURL;
    this.defaultTimeout = 10000; // 10 seconds
  }

  createRequestId(prefix = 'mc') {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return `${prefix}-${window.crypto.randomUUID()}`;
    }

    return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  // GET request with error handling
  async get(endpoint, params = {}, options = {}) {
    const url = new URL(this.baseURL + endpoint, window.location.origin);
    
    // Add query parameters
    Object.entries(params).forEach(([key, value]) => {
      if (value !== null && value !== undefined && value !== '') {
        url.searchParams.append(key, value);
      }
    });

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), options.timeout || this.defaultTimeout);

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
        signal: controller.signal,
        ...options
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        let errorPayload = null;
        try {
          errorPayload = await response.json();
        } catch (error) {
          errorPayload = null;
        }
        throw new APIError(
          errorPayload && errorPayload.error ? errorPayload.error : `HTTP ${response.status}: ${response.statusText}`,
          response.status,
          endpoint,
          errorPayload
        );
      }

      const data = await response.json();
      return data;
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new APIError(`Request timeout (${options.timeout || this.defaultTimeout}ms)`, 408, endpoint);
      }
      if (error instanceof APIError) {
        throw error;
      }
      throw new APIError(`Network error: ${error.message}`, 0, endpoint);
    }
  }

  // POST request with support for both JSON and FormData
  async post(endpoint, data, options = {}) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), options.timeout || this.defaultTimeout);

      const isFormData = data instanceof FormData;
      const fetchOptions = {
        method: 'POST',
        body: isFormData ? data : JSON.stringify(data),
        signal: controller.signal,
        ...options
      };

      // Set headers for JSON, let browser set for FormData
      if (!isFormData) {
        fetchOptions.headers = {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          ...options.headers
        };
      } else {
        fetchOptions.headers = {
          'Accept': 'application/json',
          ...options.headers
        };
      }

      const response = await fetch(this.baseURL + endpoint, fetchOptions);
      clearTimeout(timeoutId);

      if (!response.ok) {
        let errorPayload = null;
        try {
          errorPayload = await response.json();
        } catch (error) {
          errorPayload = null;
        }
        throw new APIError(
          errorPayload && errorPayload.error ? errorPayload.error : `HTTP ${response.status}: ${response.statusText}`,
          response.status,
          endpoint,
          errorPayload
        );
      }

      const responseData = await response.json();
      return responseData;
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new APIError(`Request timeout (${options.timeout || this.defaultTimeout}ms)`, 408, endpoint);
      }
      if (error instanceof APIError) {
        throw error;
      }
      throw new APIError(`Network error: ${error.message}`, 0, endpoint);
    }
  }

  // Retry wrapper for resilient API calls
  async withRetry(apiCall, maxRetries = 2, backoffMs = 1000) {
    let lastError;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await apiCall();
      } catch (error) {
        lastError = error;
        
        // Don't retry on 4xx errors (client errors) except 408 (timeout)
        if (error.status >= 400 && error.status < 500 && error.status !== 408) {
          break;
        }
        
        if (attempt < maxRetries) {
          console.warn(`API call failed (attempt ${attempt + 1}/${maxRetries + 1}):`, error.message);
          await this.sleep(backoffMs * Math.pow(2, attempt)); // Exponential backoff
        }
      }
    }
    
    throw lastError;
  }

  // Utility method for delays
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Specific API endpoints for Mission Control v3
  
  // v2 Endpoints (existing)
  async getGatewayStatus() {
    return this.withRetry(() => this.get('/gateway'));
  }

  async getAgents() {
    return this.withRetry(() => this.get('/agents'));
  }

  async getOllama() {
    return this.withRetry(() => this.get('/ollama'));
  }

  async getTasks() {
    return this.withRetry(() => this.get('/tasks'));
  }

  async getDecisions() {
    return this.withRetry(() => this.get('/decisions'));
  }

  async getPinned() {
    return this.withRetry(() => this.get('/pinned'));
  }

  async getHealth() {
    return this.withRetry(() => this.get('/health'));
  }

  async getCrons() {
    return this.withRetry(() => this.get('/crons'));
  }

  // v3 New Endpoints
  async getTasksFinished(filters = {}) {
    return this.withRetry(() => this.get('/tasks/finished', filters));
  }

  async getTasksLog(sinceTimestamp = null) {
    const params = sinceTimestamp ? { since: sinceTimestamp } : {};
    return this.withRetry(() => this.get('/tasks/log', params));
  }

  async getHierarchy() {
    return this.withRetry(() => this.get('/hierarchy'));
  }

  async getPipelineStatus() {
    return this.withRetry(() => this.get('/pipeline/status'));
  }

  async getPipelineSlices(filters = {}) {
    return this.withRetry(() => this.get('/pipeline/slices', filters));
  }

  async getPipelineSlice(id) {
    return this.withRetry(() => this.get(`/pipeline/slices/${id}`));
  }

  async getPipelineEvents(id) {
    return this.withRetry(() => this.get(`/pipeline/slices/${id}/events`));
  }

  async getPipelineFeatures() {
    return this.withRetry(() => this.get('/pipeline/features'));
  }

  async approvePipelineSlice(id, notes = '', requestId = this.createRequestId('pipeline-approve')) {
    return this.withRetry(() => this.post(`/pipeline/slices/${id}/approve`, { notes, requestId }));
  }

  async rejectPipelineSlice(id, reason, requestId = this.createRequestId('pipeline-reject')) {
    return this.withRetry(() => this.post(`/pipeline/slices/${id}/reject`, { reason, requestId }));
  }

  async dispatchPipelineSlice(id, requestId = this.createRequestId('pipeline-dispatch')) {
    return this.withRetry(() => this.post(`/pipeline/slices/${id}/dispatch`, { requestId }));
  }

  async cancelPipelineSlice(id, requestId = this.createRequestId('pipeline-cancel')) {
    return this.withRetry(() => this.post(`/pipeline/slices/${id}/cancel`, { requestId }));
  }

  async saveWhiteboard(canvasBlob, metadata = {}) {
    const formData = new FormData();
    formData.append('image', canvasBlob, 'whiteboard.png');
    formData.append('metadata', JSON.stringify(metadata));
    
    return this.withRetry(() => this.post('/whiteboard', formData));
  }

  // Batch data fetching for overview tab
  async getOverviewData() {
    try {
      const [gateway, agents, tasks, health] = await Promise.allSettled([
        this.getGatewayStatus(),
        this.getAgents(),
        this.getTasks(),
        this.getHealth()
      ]);

      return {
        gateway: gateway.status === 'fulfilled' ? gateway.value : { error: gateway.reason?.message },
        agents: agents.status === 'fulfilled' ? agents.value : { error: agents.reason?.message },
        tasks: tasks.status === 'fulfilled' ? tasks.value : { error: tasks.reason?.message },
        health: health.status === 'fulfilled' ? health.value : { error: health.reason?.message },
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      throw new APIError(`Failed to fetch overview data: ${error.message}`, 0, '/overview-batch');
    }
  }
}

// Custom error class for API errors
class APIError extends Error {
  constructor(message, status, endpoint, payload = null) {
    super(message);
    this.name = 'APIError';
    this.status = status;
    this.endpoint = endpoint;
    this.payload = payload;
    this.timestamp = new Date().toISOString();
  }

  toString() {
    return `${this.name} (${this.status}): ${this.message} [${this.endpoint}]`;
  }
}

// Global API client instance
window.api = new APIClient();
window.APIError = APIError;
