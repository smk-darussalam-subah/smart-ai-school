#!/usr/bin/env python3
"""Package exact checkout bytes for the existing in-memory SSH transport."""
import base64
from pathlib import Path
import sys


def package(mode):
    root = Path(__file__).resolve().parent
    core = (root / 'staging-readiness-deploy.py').read_bytes()
    if mode == 'recovery-only':
        return base64.b64encode(core).decode()
    if mode != 'application':
        raise ValueError('unknown staging release mode')
    app = (root / 'staging-application-deploy.py').read_bytes()
    wrapper = (
        'import base64,sys,types\n'
        'core=types.ModuleType("diis_staging_core")\n'
        'sys.modules["diis_staging_core"]=core\n'
        f'exec(compile(base64.b64decode({base64.b64encode(core)!r}),"reviewed-core","exec"),core.__dict__)\n'
        f'exec(compile(base64.b64decode({base64.b64encode(app)!r}),"reviewed-application","exec"))\n'
    )
    return base64.b64encode(wrapper.encode()).decode()


if __name__ == '__main__':
    if len(sys.argv) != 2:
        sys.exit(65)
    print('payload=' + package(sys.argv[1]))
