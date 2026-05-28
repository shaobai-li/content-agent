import argparse
import uvicorn
from .config import load_config


def main():
    parser = argparse.ArgumentParser(description="WeChat iLink Bridge")
    parser.add_argument("--config", default="backend/wechat_bridge.yaml", help="YAML config path")
    parser.add_argument("--port", type=int, default=None, help="Override port")
    parser.add_argument("--backend-url", default=None, help="Override backend URL")
    parser.add_argument("--agent-id", default=None, help="Override agent ID")
    parser.add_argument("--user-id", default=None, help="Override user ID for X-User-Id header")
    args = parser.parse_args()

    config = load_config(args.config)
    if args.port:
        config.bridge.port = args.port
    if args.backend_url:
        config.bridge.backend_url = args.backend_url
    if args.agent_id:
        config.bridge.agent_id = args.agent_id
    if args.user_id:
        config.bridge.user_id = args.user_id

    from .server import create_app
    app = create_app(config)
    uvicorn.run(app, host=config.bridge.host, port=config.bridge.port)


if __name__ == "__main__":
    main()
