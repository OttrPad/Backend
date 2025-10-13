import axios, { AxiosResponse } from "axios";
import { log } from "console";
import { Request, Response } from "express";

// Service configuration
interface ServiceConfig {
  name: string;
  baseUrl: string;
  timeout?: number;
}

// Available microservices
const services: Record<string, ServiceConfig> = {
  core: {
    name: "Core Service",
    baseUrl: process.env.CORE_SERVICE_URL || "http://localhost:3001",
    timeout: 30000, // 30 seconds
  },
  collaboration: {
    name: "Collaboration Service",
    baseUrl: process.env.COLLABORATION_SERVICE_URL || "http://localhost:5002",
    timeout: 15000, // 15 seconds for real-time features
  },
  execution: {
    name: "Execution Service",
    baseUrl: process.env.EXECUTION_SERVICE_URL || "http://localhost:4004",
    timeout: 20000,
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
      const headers: Record<string, any> = {
        ...req.headers,
        "x-forwarded-for": req.ip,
        "x-forwarded-host": req.get("host"),
        "x-gateway-user-id": req.user?.id,
        "x-gateway-user-email": req.user?.email,
        "x-original-url": req.originalUrl,
      };

      // Remove host header to avoid conflicts
  delete headers.host;

      const headerKeysToStrip = ["content-length", "transfer-encoding"];
      headerKeysToStrip.forEach((key) => {
        delete headers[key];
        delete headers[key.toLowerCase()];
        delete headers[key.toUpperCase()];
      });

      console.log(
        `🔄 Proxying ${req.method} ${req.originalUrl} -> ${targetUrl}`
      );

      // Trace resolved service configuration to catch mis-routed traffic
      console.log("[ServiceProxy] Resolved service", {
        serviceName,
        targetUrl,
        timeout: service.timeout,
      });

      console.log("[ServiceProxy] Forwarding body", {
        hasBody: typeof req.body !== "undefined",
        type: typeof req.body,
        keys: req.body && typeof req.body === "object" ? Object.keys(req.body) : undefined,
      });

      // Make the request to the microservice
      const axiosConfig: any = {
        method: req.method as any,
        url: targetUrl,
        data: req.body,
        headers,
        params: req.query,
        timeout: service.timeout,
        validateStatus: () => true, // Don't throw on any status code
      };

      // Stringify JSON bodies explicitly to avoid raw-body retry aborts
      if (req.body && typeof req.body === "object") {
        axiosConfig.data = JSON.stringify(req.body);
        axiosConfig.headers = {
          ...headers,
          "content-type": "application/json",
        };
      }

      const response: AxiosResponse = await axios(axiosConfig);

      // Forward the response
      res.status(response.status);

      // Forward response headers (except some that might cause issues)
      const excludeHeaders = ["transfer-encoding", "connection", "keep-alive"];
      Object.entries(response.headers).forEach(([key, value]) => {
        if (!excludeHeaders.includes(key.toLowerCase())) {
          res.set(key, value as string);
        }
      });

      res.json(response.data);
    } catch (error: any) {
      console.error(`❌ Error proxying to ${serviceName}:`, error.message);

      if (error.code === "ECONNREFUSED") {
        res.status(503).json({
          error: "Service unavailable",
          message: `${services[serviceName]?.name || serviceName} is not responding`,
          service: serviceName,
        });
      } else if (error.code === "ECONNABORTED") {
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
          const response = await axios.get(`${config.baseUrl}/status`, {
            timeout: 5000,
          });
          return {
            name,
            status: "healthy",
            response: response.data,
            responseTime: response.headers["x-response-time"] || "unknown",
          };
        } catch (error: any) {
          return {
            name,
            status: "unhealthy",
            error: error.message,
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
