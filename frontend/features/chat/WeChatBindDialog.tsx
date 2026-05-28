"use client";

import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/shared/ui/dialog";
import { Button } from "@/shared/ui/button";
import { RefreshCw } from "lucide-react";

const BRIDGE_URL = process.env.NEXT_PUBLIC_BRIDGE_URL || "http://localhost:8001";

type QRStatus = "loading" | "wait" | "scanned" | "confirmed" | "expired" | "error";

interface WeChatBindDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onBindSuccess?: () => void;
}

export function WeChatBindDialog({ open, onOpenChange, onBindSuccess }: WeChatBindDialogProps) {
  const [qrCodeUrl, setQrCodeUrl] = useState<string>("");
  const [qrCodeKey, setQrCodeKey] = useState<string>("");
  const [imgError, setImgError] = useState(false);
  const [status, setStatus] = useState<QRStatus>("loading");
  const pollingRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!open) {
      setStatus("loading");
      setQrCodeUrl("");
      setQrCodeKey("");
      return;
    }
    fetchQRCode();
    return () => pollingRef.current?.abort();
  }, [open]);

  const fetchQRCode = async () => {
    setStatus("loading");
    setImgError(false);
    try {
      const res = await fetch(`${BRIDGE_URL}/api/wechat/qrcode`);
      if (!res.ok) throw new Error("fetch qrcode failed");
      const data = await res.json();
      setQrCodeKey(data.qrcode_key);
      const imgSrc = data.qrcode_img_url || "";
      setQrCodeUrl(imgSrc);
      setStatus("wait");
      startPolling(data.qrcode_key);
    } catch {
      setStatus("error");
    }
  };

  const startPolling = (qrcode: string) => {
    pollingRef.current?.abort();
    const controller = new AbortController();
    pollingRef.current = controller;

    const poll = async () => {
      if (controller.signal.aborted) return;
      try {
        const res = await fetch(
          `${BRIDGE_URL}/api/wechat/qrcode/status?qrcode=${encodeURIComponent(qrcode)}`,
          { signal: controller.signal },
        );
        if (!res.ok) {
          setTimeout(poll, 2000);
          return;
        }
        const data = await res.json();
        switch (data.status) {
          case "scanned":
          case "scaned":
            setStatus("scanned");
            setTimeout(poll, 2000);
            break;
          case "confirmed":
            setStatus("confirmed");
            if (data.bot_token) {
              await fetch(`${BRIDGE_URL}/api/wechat/bridge/start`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  token: data.bot_token,
                  base_url: data.base_url || "https://ilinkai.weixin.qq.com",
                }),
              });
            }
            onBindSuccess?.();
            break;
          case "expired":
            setStatus("expired");
            break;
          default:
            setTimeout(poll, 2000);
        }
      } catch {
        // polling ended
      }
    };
    poll();
  };

  const statusText: Record<QRStatus, string> = {
    loading: "加载中...",
    wait: "请使用微信扫一扫扫描二维码",
    scanned: "已扫码，请在手机上确认登录",
    confirmed: "绑定成功",
    expired: "二维码已过期",
    error: "加载失败",
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>绑定微信</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center gap-4 py-4">
          {qrCodeUrl && !imgError && status !== "loading" && (
            <div className="rounded-lg border p-2">
              <img
                src={qrCodeUrl}
                alt="QR Code"
                className="h-48 w-48"
                onError={() => setImgError(true)}
              />
            </div>
          )}
          {imgError && status !== "loading" && (
            <div className="flex h-48 w-48 items-center justify-center rounded-lg border">
              <span className="text-sm text-muted-foreground">二维码加载失败</span>
            </div>
          )}
          {status === "loading" && (
            <div className="flex h-48 w-48 items-center justify-center rounded-lg border">
              <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          )}
          <p className={`text-sm ${
            status === "confirmed" ? "text-green-600" :
            status === "expired" || status === "error" ? "text-red-500" :
            "text-muted-foreground"
          }`}>
            {statusText[status]}
          </p>
          {(status === "expired" || status === "error") && (
            <Button variant="outline" onClick={fetchQRCode}>
              <RefreshCw className="mr-2 h-4 w-4" />
              重新获取二维码
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
