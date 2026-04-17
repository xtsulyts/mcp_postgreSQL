import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import pg from "pg";

const { Pool } = pg;

// --- Conexión a PostgreSQL ---
const pool = new Pool({
  host: process.env.PG_HOST ?? "localhost",
  port: Number(process.env.PG_PORT ?? 5433),
  database: process.env.PG_DATABASE ?? "mcp_db",
  user: process.env.PG_USER ?? "mcp_user",
  password: process.env.PG_PASSWORD ?? "mcp_password",
});

// --- MCP Server ---
const server = new McpServer({
  name: "mcp-postgres",
  version: "1.0.0",
});

// --- Tool: list_tables ---
server.tool(
  "list_tables",
  "Lista todas las tablas del schema público de la base de datos",
  {},
  async () => {
    const result = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `);

    const tables = result.rows.map((r) => r.table_name).join("\n");

    return {
      content: [
        {
          type: "text",
          text: tables.length > 0 ? tables : "No hay tablas en el schema público.",
        },
      ],
    };
  }
);

// --- Tool: describe_table ---
server.tool(
  "describe_table",
  "Muestra las columnas y tipos de datos de una tabla",
  { table_name: z.string().describe("Nombre de la tabla a describir") },
  async ({ table_name }) => {
    const result = await pool.query(
      `
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1
      ORDER BY ordinal_position
      `,
      [table_name]
    );

    if (result.rows.length === 0) {
      return {
        content: [{ type: "text", text: `Tabla "${table_name}" no encontrada.` }],
      };
    }

    const cols = result.rows
      .map((r) => `${r.column_name} | ${r.data_type} | nullable: ${r.is_nullable}`)
      .join("\n");

    return {
      content: [{ type: "text", text: cols }],
    };
  }
);

// --- Tool: query ---
server.tool(
  "query",
  "Ejecuta una consulta SQL de solo lectura (SELECT)",
  { sql: z.string().describe("Consulta SQL SELECT a ejecutar") },
  async ({ sql }) => {
    const trimmed = sql.trim().toLowerCase();
    if (!trimmed.startsWith("select")) {
      return {
        content: [{ type: "text", text: "Solo se permiten consultas SELECT." }],
      };
    }

    const result = await pool.query(sql);
    const text = JSON.stringify(result.rows, null, 2);

    return {
      content: [{ type: "text", text }],
    };
  }
);

server.tool(
  "count_rows",
  "Devuelve el número total de filas de una tabla especificada.",
  {
    table_name: z.string().describe("Nombre de la tabla a consultar")
  },
  async ({ table_name }) => {
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(table_name)) {
      throw new Error("Nombre de tabla inválido");
    }

    const query = `SELECT COUNT(*) as count FROM ${table_name}`;
    const result = await pool.query(query);
    const count = parseInt(result.rows[0].count, 10);

    return {
      content: [
        {
          type: "text",
          text: `La tabla '${table_name}' tiene ${count} filas.`
        }
      ]
    };
  }
);        
         
// --- Arrancar servidor ---
const transport = new StdioServerTransport();
await server.connect(transport);
