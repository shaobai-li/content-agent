"""CI 辅助脚本：验证 OpenAPI spec 格式"""
import yaml

with open('specs/openapi.yaml') as f:
    spec = yaml.safe_load(f)

assert 'paths' in spec, 'spec 缺少 paths'
assert 'openapi' in spec, 'spec 缺少 openapi 版本'
print(f'OK: {len(spec["paths"])} 个路径定义')
