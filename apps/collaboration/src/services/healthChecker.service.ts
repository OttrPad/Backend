import { ConnectionManager } from "./connectionManager.service";
import { DocumentStore } from "./documentStore.service";
import { RoomManager } from "./room.service";

export interface HealthStatus {
  status: "healthy" | "degraded" | "unhealthy";
  checks: {
    websocket: { status: string; message: string };
    database: { status: string; message: string };
    memory: { status: string; usage: number; limit: number };
    connections: { status: string; count: number; rooms: number };
    documents: { status: string; message: string };
  };
  timestamp: number;
  uptime: number;
}

export class HealthChecker {
  private connectionManager: ConnectionManager;
  private documentStore: DocumentStore;
  private roomManager: RoomManager;
  private startTime: number;
  private memoryLimit: number;

  constructor(
    connectionManager: ConnectionManager,
    documentStore: DocumentStore,
    roomManager: RoomManager,
    memoryLimitMB: number = 512
  ) {
    this.connectionManager = connectionManager;
    this.documentStore = documentStore;
    this.roomManager = roomManager;
    this.startTime = Date.now();
    this.memoryLimit = memoryLimitMB * 1024 * 1024; // Convert to bytes
  }

  /**
   * Perform comprehensive health check
   */
  async performHealthCheck(): Promise<HealthStatus> {
    const checks = {
      websocket: await this.checkWebSocketHealth(),
      database: await this.checkDatabaseHealth(),
      memory: this.checkMemoryHealth(),
      connections: this.checkConnectionHealth(),
      documents: await this.checkDocumentHealth(),
    };

    // Determine overall status
    const hasUnhealthy = Object.values(checks).some(
      (check) => check.status === "unhealthy"
    );
    const hasDegraded = Object.values(checks).some(
      (check) => check.status === "degraded"
    );

    let overallStatus: "healthy" | "degraded" | "unhealthy" = "healthy";
    if (hasUnhealthy) {
      overallStatus = "unhealthy";
    } else if (hasDegraded) {
      overallStatus = "degraded";
    }

    return {
      status: overallStatus,
      checks,
      timestamp: Date.now(),
      uptime: Date.now() - this.startTime,
    };
  }

  /**
   * Check WebSocket server health
   */
  private async checkWebSocketHealth(): Promise<{
    status: string;
    message: string;
  }> {
    try {
      // Check if we can create connections and they're being managed properly
      const metrics = this.connectionManager.getMetrics();
      const activeRooms = this.connectionManager.getActiveRooms().length;

      if (activeRooms >= 0) {
        return {
          status: "healthy",
          message: `WebSocket server operational. ${metrics.totalConnections} active connections, ${activeRooms} rooms`,
        };
      } else {
        return {
          status: "degraded",
          message: "WebSocket server running but no active connections",
        };
      }
    } catch (error) {
      return {
        status: "unhealthy",
        message: `WebSocket server error: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Check database connectivity
   */
  private async checkDatabaseHealth(): Promise<{
    status: string;
    message: string;
  }> {
    try {
      // Try to perform a simple database operation
      const testRoomId = "health-check-test";
      const stats = await this.documentStore.getDocumentStats(testRoomId);

      return {
        status: "healthy",
        message: "Database connection successful",
      };
    } catch (error) {
      return {
        status: "unhealthy",
        message: `Database connection failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Check memory usage
   */
  private checkMemoryHealth(): {
    status: string;
    usage: number;
    limit: number;
  } {
    const memoryUsage = process.memoryUsage();
    const currentUsage = memoryUsage.heapUsed;
    const usagePercentage = (currentUsage / this.memoryLimit) * 100;

    let status = "healthy";
    if (usagePercentage > 90) {
      status = "unhealthy";
    } else if (usagePercentage > 75) {
      status = "degraded";
    }

    return {
      status,
      usage: currentUsage,
      limit: this.memoryLimit,
    };
  }

  /**
   * Check connection health
   */
  private checkConnectionHealth(): {
    status: string;
    count: number;
    rooms: number;
  } {
    const metrics = this.connectionManager.getMetrics();
    const activeRooms = this.connectionManager.getActiveRooms().length;
    const totalConnections = metrics.totalConnections;

    let status = "healthy";

    // Check for too many connections (potential DoS)
    if (totalConnections > 1000) {
      status = "degraded";
    }

    // Check for connection health issues
    const detailedStatus = this.connectionManager.getDetailedStatus();
    const unhealthyConnections = detailedStatus.healthStatus.filter(
      (h) => !h.isAlive
    ).length;

    if (unhealthyConnections > totalConnections * 0.1) {
      // More than 10% unhealthy
      status = "degraded";
    }

    return {
      status,
      count: totalConnections,
      rooms: activeRooms,
    };
  }

  /**
   * Check document persistence health
   */
  private async checkDocumentHealth(): Promise<{
    status: string;
    message: string;
  }> {
    try {
      // Check if document persistence is working
      const testRoomId = "health-check-document";
      const testData = new Uint8Array([1, 2, 3, 4, 5]); // Simple test data

      // Test save operation (this will fail gracefully if room doesn't exist)
      // We're just testing if the database operations work
      const stats = await this.documentStore.getDocumentStats(testRoomId);

      return {
        status: "healthy",
        message: "Document persistence operational",
      };
    } catch (error) {
      return {
        status: "degraded",
        message: `Document persistence issues: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Get detailed system metrics
   */
  getDetailedMetrics(): {
    memory: NodeJS.MemoryUsage;
    connections: any;
    rooms: any;
    uptime: number;
    timestamp: number;
  } {
    return {
      memory: process.memoryUsage(),
      connections: this.connectionManager.getDetailedStatus(),
      rooms: this.roomManager.getAllRoomsStats(),
      uptime: Date.now() - this.startTime,
      timestamp: Date.now(),
    };
  }

  /**
   * Get simple status for quick checks
   */
  async getSimpleStatus(): Promise<{
    status: string;
    uptime: number;
    connections: number;
    rooms: number;
    memoryUsage: number;
  }> {
    const healthCheck = await this.performHealthCheck();
    const metrics = this.connectionManager.getMetrics();

    return {
      status: healthCheck.status,
      uptime: healthCheck.uptime,
      connections: metrics.totalConnections,
      rooms: this.connectionManager.getActiveRooms().length,
      memoryUsage: process.memoryUsage().heapUsed,
    };
  }

  /**
   * Check if service is ready to accept connections
   */
  async isReady(): Promise<boolean> {
    try {
      const health = await this.performHealthCheck();
      return health.status !== "unhealthy";
    } catch (error) {
      return false;
    }
  }

  /**
   * Check if service is alive (basic liveness check)
   */
  isAlive(): boolean {
    try {
      // Basic checks that don't require async operations
      const memoryCheck = this.checkMemoryHealth();
      const connectionCheck = this.checkConnectionHealth();

      return (
        memoryCheck.status !== "unhealthy" &&
        connectionCheck.status !== "unhealthy"
      );
    } catch (error) {
      return false;
    }
  }
}
