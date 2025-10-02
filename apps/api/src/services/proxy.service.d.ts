import { Request, Response } from "express";
interface ServiceConfig {
    name: string;
    baseUrl: string;
    timeout?: number;
}
export declare class ServiceProxy {
    private static instance;
    private constructor();
    static getInstance(): ServiceProxy;
    /**
     * Proxy a request to a specific microservice
     */
    proxyRequest(serviceName: string, path: string, req: Request, res: Response): Promise<void>;
    /**
     * Check health of all services
     */
    checkHealth(): Promise<Record<string, any>>;
    /**
     * Get service configuration
     */
    getServices(): Record<string, ServiceConfig>;
}
export declare const serviceProxy: ServiceProxy;
export {};
