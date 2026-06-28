import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { execSync } from "child_process";
import { loadEnv } from "vite";

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
      version: "0.1.0",
      commit,
      buildTime: new Date().toISOString(),
      branch,
    };
  } catch {
    return {
      version: "0.1.0",
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
