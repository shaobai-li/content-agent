from pathlib import Path
import yaml

CONFIG_PATH = Path("config.yaml")
with open(CONFIG_PATH, "r") as f:
    config = yaml.safe_load(f)

DATA_DIR = Path(config["DATA_DIR"])