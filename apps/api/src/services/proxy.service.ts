import { Request, Response } from "express";

// Service configuration
interface ServiceConfig {
  name: string;
  baseUrl: string;
  timeout?: number;
}

// Available microservices
const toMs = (v: string | undefined, fallback: number) => {
  const n = v ? parseInt(v, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

const services: Record<string, ServiceConfig> = {
  core: {
    name: "Core Service",
    baseUrl: process.env.CORE_SERVICE_URL || "http://localhost:3001",
    timeout: toMs(process.env.CORE_SERVICE_TIMEOUT_MS, 30000), // 30s default
  },
  collaboration: {
    name: "Collaboration Service",
    baseUrl: process.env.COLLABORATION_SERVICE_URL || "http://localhost:5002",
    timeout: toMs(process.env.COLLABORATION_SERVICE_TIMEOUT_MS, 15000), // 15s default
  },
  execution: {
    name: "Execution Service",
    baseUrl: process.env.EXECUTION_SERVICE_URL || "http://localhost:4004",
    timeout: toMs(process.env.EXECUTION_SERVICE_TIMEOUT_MS, 20000),
  },
  "version-control": {
    name: "Version Control Service",
    // The VCS app mounts routes at /api/version-control, so include that prefix in baseUrl
    // You can set VERSION_CONTROL_SERVICE_URL to the host:port (e.g., http://localhost:5000)
    // and we'll append /api/version-control for correct routing.
    baseUrl: `${process.env.VERSION_CONTROL_SERVICE_URL || "http://localhost:5000"}/api/version-control`,
    timeout: toMs(process.env.VERSION_CONTROL_SERVICE_TIMEOUT_MS, 20000),
  },
  // Add more services here as they're created
  // auth: {
  //   name: 'Auth Service',
  //   baseUrl: process.env.AUTH_SERVICE_URL || 'http://localhost:4002',
  //   timeout: 10000
  // }
};

export class ServiceProxy {
  private static instance: ServiceProxy;

  private constructor() {}

  public static getInstance(): ServiceProxy {
    if (!ServiceProxy.instance) {
      ServiceProxy.instance = new ServiceProxy();
    }
    return ServiceProxy.instance;
  }

  /**
   * Proxy a request to a specific microservice
   */
  async proxyRequest(
    serviceName: string,
    path: string,
    req: Request,
    res: Response
  ): Promise<void> {
    try {
      const service = services[serviceName];

      if (!service) {
        res.status(404).json({
          error: "Service not found",
          message: `Service '${serviceName}' is not configured`,
        });
        return;
      }

      // Build the target URL
      const targetUrl = `${service.baseUrl}${path}`;

      // Prepare headers (forward most headers but add some custom ones)
      const headers = {
        ...req.headers,
        "x-forwarded-for": req.ip,
        "x-forwarded-host": req.get("host"),
        "x-gateway-user-id": req.user?.id,
        "x-gateway-user-email": req.user?.email,
        "x-original-url": req.originalUrl,
      };

      // Remove host header to avoid conflicts
      delete headers.host;

      console.log(
        `🔄 Proxying ${req.method} ${req.originalUrl} -> ${targetUrl}`
      );

      // Build URL with query params
      const urlObj = new URL(targetUrl);
      const searchParams = new URLSearchParams(urlObj.search);
      for (const [k, v] of Object.entries(req.query || {})) {
        if (Array.isArray(v))
          v.forEach((vv) => searchParams.append(k, String(vv)));
        else if (v !== undefined) searchParams.set(k, String(v));
      }
      urlObj.search = searchParams.toString();

      // Timeout with AbortController
      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        service.timeout || 20000
      );

      // Prepare fetch init
      const init: RequestInit = {
        method: req.method,
        headers: headers as any,
        signal: controller.signal,
      };
      // JSON bodies
      if (
        req.body !== undefined &&
        req.method !== "GET" &&
        req.method !== "HEAD"
      ) {
        init.body =
          typeof req.body === "string" ? req.body : JSON.stringify(req.body);
        if (!(headers as any)["content-type"]) {
          (init.headers as any)["content-type"] = "application/json";
        }
      }

      const response = await fetch(urlObj.toString(), init).catch((err) => {
        // Normalize abort/timeout errors
        if ((err as any).name === "AbortError") {
          const e: any = new Error("timeout");
          (e.code as any) = "ECONNABORTED";
          throw e;
        }
        throw err;
      });

      clearTimeout(timeout);

      // Forward the response
      res.status(response.status);

      // Forward response headers (except some that might cause issues)
      const excludeHeaders = ["transfer-encoding", "connection", "keep-alive"];
      response.headers.forEach((value, key) => {
        if (!excludeHeaders.includes(key.toLowerCase())) {
          res.set(key, value);
        }
      });

      const contentType = response.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        const data = await response.json().catch(() => ({}));
        res.json(data);
      } else {
        const text = await response.text();
        res.send(text);
      }
    } catch (error: any) {
      console.error(
        `❌ Error proxying to ${serviceName}:`,
        error?.message || error
      );

      if (error.code === "ECONNREFUSED") {
        res.status(503).json({
          error: "Service unavailable",
          message: `${services[serviceName]?.name || serviceName} is not responding`,
          service: serviceName,
        });
      } else if (error.code === "ECONNABORTED" || error.name === "AbortError") {
        res.status(504).json({
          error: "Gateway timeout",
          message: `Request to ${services[serviceName]?.name || serviceName} timed out`,
          service: serviceName,
        });
      } else {
        res.status(502).json({
          error: "Bad gateway",
          message: "An error occurred while communicating with the service",
          service: serviceName,
        });
      }
    }
  }

  /**
   * Check health of all services
   */
  async checkHealth(): Promise<Record<string, any>> {
    const healthChecks = await Promise.allSettled(
      Object.entries(services).map(async ([name, config]) => {
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 5000);
          const response = await fetch(`${config.baseUrl}/status`, {
            signal: controller.signal,
          }).finally(() => clearTimeout(timeout));
          let data: any = null;
          const ct = response.headers.get("content-type") || "";
          if (ct.includes("application/json"))
            data = await response.json().catch(() => null);
          else data = await response.text().catch(() => null);
          return {
            name,
            status: response.ok ? "healthy" : "unhealthy",
            response: data,
            responseTime: response.headers.get("x-response-time") || "unknown",
          };
        } catch (error: any) {
          return {
            name,
            status: "unhealthy",
            error: error?.message || String(error),
            lastChecked: new Date().toISOString(),
          };
        }
      })
    );

    const result: Record<string, any> = {};
    healthChecks.forEach((check, index) => {
      const serviceName = Object.keys(services)[index];
      result[serviceName] =
        check.status === "fulfilled"
          ? check.value
          : {
              name: serviceName,
              status: "error",
              error: "Health check failed",
            };
    });

    return result;
  }

  /**
   * Get service configuration
   */
  getServices(): Record<string, ServiceConfig> {
    return services;
  }
}

export const serviceProxy = ServiceProxy.getInstance();
