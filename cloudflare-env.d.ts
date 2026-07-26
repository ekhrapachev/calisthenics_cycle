type D1Value = null | boolean | number | string | ArrayBuffer;

interface D1Result<T> {
  results: T[];
  success: boolean;
}

interface D1PreparedStatement {
  bind(...values: D1Value[]): D1PreparedStatement;
  first<T = Record<string, D1Value>>(): Promise<T | null>;
  all<T = Record<string, D1Value>>(): Promise<D1Result<T>>;
  run<T = Record<string, D1Value>>(): Promise<D1Result<T>>;
}

interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = Record<string, D1Value>>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
}

declare module "cloudflare:workers" {
  export const env: {
    DB: D1Database;
  };
}
