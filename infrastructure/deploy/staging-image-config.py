#!/usr/bin/env python3
"""Fixed public staging build configuration. No secrets or free build arguments."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import sys

spec = importlib.util.spec_from_file_location('artifact', Path(__file__).with_name('backup-image-artifact.py'))
artifact = importlib.util.module_from_spec(spec)
spec.loader.exec_module(artifact)


def digest(config):
    return hashlib.sha256(json.dumps(config, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


if __name__ == '__main__':
    try:
        profile = sys.argv[1]
        config = artifact.build_config(profile, os.environ.get('STAGING_VAPID_PUBLIC_KEY', '')
                                       if profile == 'web' else '')
        print(digest(config))
    except (ValueError, KeyError, IndexError):
        sys.exit('STAGING_BUILD_CONFIG_REJECTED')
