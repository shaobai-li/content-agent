import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  // 加载 .env.local 中的环境变量，用于 proxy target
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const authApiUrl = env.VITE_AUTH_API_URL || "http://localhost:3005";

  return {
    plugins: [react()],
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
