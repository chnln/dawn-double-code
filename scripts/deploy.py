"""Publish only the static app to the gh-pages branch of a private GitHub repo."""
import argparse
import json
import shutil
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ("index.html", "app.js", "core.js", "styles.css")


def run(*args, cwd=None, input=None, check=True):
    return subprocess.run(args, cwd=cwd, input=input, text=True, capture_output=True, check=check)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", required=True, help="OWNER/REPO, e.g. chnln/Double-Check")
    args = parser.parse_args()
    if len(args.repo.split('/')) != 2 or any(not part or not all(c.isalnum() or c in '-_.' for c in part) for part in args.repo.split('/')):
        parser.error("Use a valid OWNER/REPO")
    repo = json.loads(run('gh', 'api', f'repos/{args.repo}').stdout)
    if not repo.get('private'):
        raise SystemExit('Expected a private repository. This script will not change visibility.')
    remote = repo['clone_url']
    git = ['git', '-c', 'credential.helper=', '-c', 'credential.helper=!gh auth git-credential']
    with tempfile.TemporaryDirectory(prefix='double-check-pages-') as temp:
        run('git', 'init', '-b', 'gh-pages', temp)
        run('git', 'remote', 'add', 'origin', remote, cwd=temp)
        branches = run(*git, 'ls-remote', '--heads', remote, 'gh-pages').stdout
        if branches.strip():
            run(*git, 'fetch', '--depth=1', 'origin', 'gh-pages', cwd=temp)
            run('git', 'checkout', '-B', 'gh-pages', 'FETCH_HEAD', cwd=temp)
            # This dedicated branch contains only generated website assets.
            for path in Path(temp).iterdir():
                if path.name != '.git':
                    shutil.rmtree(path) if path.is_dir() else path.unlink()
        for name in ASSETS:
            shutil.copy2(ROOT / 'site' / name, Path(temp) / name)
        (Path(temp) / '.nojekyll').touch()
        run('git', 'add', '--all', cwd=temp)
        if run('git', 'diff', '--cached', '--quiet', cwd=temp, check=False).returncode:
            run('git', 'commit', '-m', 'Publish Double Check static app', cwd=temp)
            run(*git, 'push', 'origin', 'HEAD:gh-pages', cwd=temp)
    endpoint = f'repos/{args.repo}/pages'
    existing = run('gh', 'api', endpoint, check=False)
    if existing.returncode and '404' not in existing.stderr + existing.stdout:
        raise SystemExit(existing.stderr or existing.stdout)
    method = 'POST' if existing.returncode else 'PUT'
    payload = json.dumps({'build_type': 'legacy', 'source': {'branch': 'gh-pages', 'path': '/'}})
    result = run('gh', 'api', '--method', method, endpoint, '--input', '-', input=payload, check=False)
    if result.returncode:
        raise SystemExit('The gh-pages branch is ready, but GitHub Pages could not be enabled:\n' + result.stderr + result.stdout)
    # An unchanged branch may still need an explicit build after first enabling Pages.
    run('gh', 'api', '--method', 'POST', f'{endpoint}/builds', check=False)
    info = json.loads(run('gh', 'api', endpoint).stdout)
    print(info.get('html_url', 'Pages configured; check repository Settings → Pages.'))
    print('Source: gh-pages / (root). Research data is not published.')


if __name__ == '__main__':
    try:
        main()
    except subprocess.CalledProcessError as error:
        raise SystemExit(error.stderr or error.stdout or str(error)) from error
