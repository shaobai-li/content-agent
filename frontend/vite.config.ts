import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import fs from "fs";
import { execSync } from "child_process";
import { loadEnv } from "vite";

/** 从 src-tauri/Cargo.toml 中读取 package version */
function getPackageVersion(): string {
  try {
    const cargo = fs.readFileSync(
      path.resolve(__dirname, "../src-tauri/Cargo.toml"),
      "utf-8",
    );
    const match = cargo.match(/^version\s*=\s*"([^"]+)"/m);
    return match?.[1] ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

function getBuildInfo() {
  try {
    const commit = execSync("git rev-parse --short HEAD", {
      cwd: __dirname,
    })
      .toString()
      .trim();
    const branch = execSync("git rev-parse --abbrev-ref HEAD", {
      cwd: __dirname,
    })
      .toString()
      .trim();
    return {
      version: getPackageVersion(),
      commit,
      buildTime: new Date().toISOString(),
      branch,
    };
  } catch {
    return {
      version: getPackageVersion(),
      commit: "unknown",
      buildTime: new Date().toISOString(),
      branch: "unknown",
    };
  }
}

export default defineConfig(({ mode }) => {
  // 加载 .env.local 中的环境变量，用于 proxy target
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const authApiUrl = env.VITE_AUTH_API_URL || "http://localhost:3005";

  return {
    plugins: [react()],
    define: {
      __BUILD_INFO__: JSON.stringify(getBuildInfo()),
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "."),
      },
    },
    server: {
      port: 5173,
      proxy: {
        // Auth 请求（/api/login、/api/me）→ 认证服务器
        "/api": {
          target: authApiUrl,
          changeOrigin: true,
        },
      },
    },
  };
});
