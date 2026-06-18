/// <reference types="jest" />
import { GenericContainer } from "testcontainers";

describe("Database tests", () => {
  let container: any;
  let connectionString: string;

  beforeAll(async () => {
    // Start a PostgreSQL container
    container = await new GenericContainer("postgres:15")
      .withEnvironment({
        POSTGRES_USER: "test",
        POSTGRES_PASSWORD: "test",
        POSTGRES_DB: "testdb"
      })
      .withExposedPorts(5432)
      .start();

    const host = container.getHost();
    const port = container.getMappedPort(5432);
    connectionString = `postgresql://test:test@${host}:${port}/testdb`;
  }, 60000); // 60 second timeout for container startup

  afterAll(async () => {
    if (container) {
      await container.stop();
    }
  }, 30000); // 30 second timeout for container cleanup

  test("should connect to database", async () => {
    // Your test code here using connectionString
    expect(connectionString).toBeDefined();
    expect(connectionString).toContain("postgresql://");
  }, 10000); // 10 second timeout for test
});