import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// backend/src/config.ts (or backend/dist/config.js) -> repo root is two levels up.
export const ROOT_DIR = path.resolve(__dirname, "..", "..");
export const MATERIAS_DIR = path.join(ROOT_DIR, "materias");

// .env lives at the repo root, not inside backend/, regardless of the process cwd.
dotenv.config({ path: path.join(ROOT_DIR, ".env") });

export const PORT = Number(process.env.PORT ?? 3333);
// Formato "provider/model" (ex.: "anthropic/claude-sonnet-5"). Vazio = modelo padrão do opencode.
export const OPENCODE_MODEL = process.env.OPENCODE_MODEL ?? "";

export const AULAS_DIR_NAME = "aulas";
export const ATIVIDADES_DIR_NAME = "atividades";
export const ANOTACOES_DIR_NAME = "anotacoes";
export const ESTUDA_DIR_NAME = ".estuda";
