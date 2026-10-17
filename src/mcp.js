#!/usr/bin/env node
// Local MCP server over stdio, for clients that run servers as a subprocess.
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./tools.js";

await createServer({ secret: process.env.RANDOLLM_SECRET }).connect(new StdioServerTransport());
