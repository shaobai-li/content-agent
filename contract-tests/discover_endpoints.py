"""CI 辅助脚本：验证端点发现逻辑正常"""
import sys
from pathlib import Path

sys.path.insert(0, 'contract-tests')
from test_contract import get_ported_endpoints

eps = get_ported_endpoints()
print(f'OK: 发现 {len(eps)} 个 non-SSE ported 端点')
for ep in eps:
    print(f'  {ep["method"]:6s} {ep["path"]}')
assert len(eps) >= 5, 'ported 端点数量异常偏少'
