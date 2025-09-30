import axios from "axios";
import { ServiceProxy } from "../src/../src/services/proxy.service";

jest.mock("axios");
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe("ServiceProxy.checkHealth", () => {
  test("returns healthy status when services respond", async () => {
    mockedAxios.get.mockResolvedValueOnce({ data: { ok: true }, headers: { "x-response-time": "10ms" } });
    const proxy = ServiceProxy.getInstance();
    const result = await proxy.checkHealth();
    // result should contain keys for configured services
    expect(result).toHaveProperty("core");
    expect(result.core).toHaveProperty("status");
  });

  test("returns unhealthy status when axios throws", async () => {
    mockedAxios.get.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    const proxy = ServiceProxy.getInstance();
    const result = await proxy.checkHealth();
    expect(result).toHaveProperty("core");
    expect(["unhealthy", "error"]).toContain(result.core.status);
  });
});
