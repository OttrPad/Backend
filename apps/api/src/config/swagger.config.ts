import swaggerJsdoc from "swagger-jsdoc";
import swaggerUi from "swagger-ui-express";
import { Express } from "express";

const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Realtime Code Editor API",
      version: "1.0.0",
      description: "API Gateway for the Realtime Code Editor Backend",
      contact: {
        name: "OttrPad Team",
        email: "support@ottrpad.com",
      },
    },
    servers: [
      {
        url: "http://localhost:4000",
        description: "Development server",
      },
      {
        url: "https://api.ottrpad.com",
        description: "Production server",
      },
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          description: "Supabase JWT token from Google OAuth login",
        },
      },
      schemas: {
        Error: {
          type: "object",
          properties: {
            error: {
              type: "string",
              description: "Error type",
            },
            message: {
              type: "string",
              description: "Human-readable error message",
            },
          },
        },
        Room: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description: "Unique room identifier",
            },
            name: {
              type: "string",
              description: "Room name",
            },
            description: {
              type: "string",
              description: "Room description",
            },
            created_at: {
              type: "string",
              format: "date-time",
              description: "Room creation timestamp",
            },
            updated_at: {
              type: "string",
              format: "date-time",
              description: "Last update timestamp",
            },
          },
        },
        User: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description: "User ID from Supabase",
            },
            email: {
              type: "string",
              format: "email",
              description: "User email",
            },
            role: {
              type: "string",
              description: "User role",
            },
          },
        },
      },
    },
    tags: [
      {
        name: "Authentication",
        description: "Authentication and user management",
      },
      {
        name: "Rooms",
        description: "Room management operations",
      },
      {
        name: "Room Access",
        description: "Room access control and invitations",
      },
      {
        name: "Room Access Management",
        description: "Room participant and invitation management",
      },
      {
        name: "User Profile",
        description: "User profile and authentication information",
      },
      {
        name: "AI Engine",
        description: "AI-powered code assistance (Coming Soon)",
      },
      {
        name: "Health",
        description: "System health and monitoring",
      },
    ],
  },
  apis: ["./src/routes/*.ts", "./src/controllers/*.ts"],
};

const specs = swaggerJsdoc(options);

export const setupSwagger = (app: Express): void => {
  // Swagger UI setup
  app.use(
    "/api-docs",
    swaggerUi.serve,
    swaggerUi.setup(specs, {
      customCss: ".swagger-ui .topbar { display: none }",
      customSiteTitle: "Realtime Code Editor API Documentation",
      swaggerOptions: {
        persistAuthorization: true,
        displayRequestDuration: true,
        filter: true,
        showExtensions: true,
        showCommonExtensions: true,
      },
    })
  );

  // OpenAPI JSON endpoint
  app.get("/api-docs.json", (req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.send(specs);
  });

  console.log("📚 Swagger UI available at: http://localhost:4000/api-docs");
  console.log(
    "📄 OpenAPI JSON available at: http://localhost:4000/api-docs.json"
  );
};

export { specs as swaggerSpecs };
