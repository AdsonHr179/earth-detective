"""Set up and run Earth Detective locally with the UI and API on one port."""

import argparse
import os
import shutil
import subprocess
import sys
import venv
from pathlib import Path


ROOT = Path(__file__).resolve().parent
FRONTEND = ROOT / "frontend"
ENV_DIR = ROOT / ".venv"
ENV_PYTHON = ENV_DIR / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
READY = ENV_DIR / ".earth-detective-ready"


def setup() -> None:
    if sys.version_info[:2] != (3, 12):
        raise ValueError("A instalação precisa do Python 3.12. No Windows, use py -3.12.")

    npm = shutil.which("npm.cmd" if os.name == "nt" else "npm")
    node = shutil.which("node")
    if not npm or not node:
        raise ValueError("Instale o Node.js 24.18 (com npm) antes de iniciar.")
    major, minor, patch = map(int, subprocess.check_output(
        [node, "--version"], text=True,
    ).strip().removeprefix("v").split("."))
    if not (
        (major == 22 and (minor, patch) >= (22, 2))
        or (major == 24 and minor >= 15)
        or major >= 26
    ):
        raise ValueError("Versão do Node.js incompatível. Use Node.js 24.18 ou superior da série 24.")

    READY.unlink(missing_ok=True)
    print("Preparando o backend na pasta .venv…", flush=True)
    venv.EnvBuilder(with_pip=True).create(ENV_DIR)
    subprocess.run(
        [str(ENV_PYTHON), "-m", "pip", "install", "-r", "backend/requirements.txt"],
        cwd=ROOT, check=True,
    )
    print("Instalando e compilando a interface…", flush=True)
    subprocess.run([npm, "ci", "--include=dev", "--no-audit", "--no-fund"], cwd=FRONTEND, check=True)
    build_env = {**os.environ, "VITE_SNAPSHOT_MODE": "0"}
    subprocess.run([npm, "run", "build"], cwd=FRONTEND, env=build_env, check=True)
    READY.touch()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--setup", action="store_true", help="Reinstala dependências e recompila após atualizar o repositório.")
    parser.add_argument("--port", type=int, default=8000, help="Porta local (padrão: 8000).")
    args = parser.parse_args()
    if not 1 <= args.port <= 65535:
        parser.error("A porta deve estar entre 1 e 65535.")

    try:
        if args.setup or not all(path.is_file() for path in (ENV_PYTHON, READY, FRONTEND / "dist/index.html")):
            setup()
        server_env = os.environ.copy()
        server_env["PYTHONPATH"] = os.pathsep.join(
            filter(None, (str(ROOT / "backend"), server_env.get("PYTHONPATH"))),
        )
        print(f"Earth Detective: http://127.0.0.1:{args.port}/ (Ctrl+C para sair)", flush=True)
        return subprocess.call(
            [str(ENV_PYTHON), "-m", "uvicorn", "serve:app", "--host", "127.0.0.1",
             "--port", str(args.port), "--no-server-header"],
            cwd=ROOT, env=server_env,
        )
    except KeyboardInterrupt:
        return 0
    except (OSError, ValueError, subprocess.CalledProcessError) as exc:
        print(f"Falha ao preparar o Earth Detective: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
