param(
  [string]$RagHome = 'E:\111\ai-game-engine-rag',
  [string]$ModelName = 'BAAI/bge-small-zh-v1.5'
)
$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$Python = 'C:\Users\administered0\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe'
$PackageDir = Join-Path $RagHome 'python-packages'
$ModelDir = Join-Path $RagHome 'models'
$env:PIP_CACHE_DIR = Join-Path $RagHome 'pip-cache'
$env:HF_HOME = Join-Path $RagHome 'huggingface'
$env:SENTENCE_TRANSFORMERS_HOME = $ModelDir
$env:PYTHONPATH = "$PackageDir;$ProjectRoot"
New-Item -ItemType Directory -Force -Path $PackageDir,$ModelDir,$env:PIP_CACHE_DIR,$env:HF_HOME | Out-Null
& $Python -m pip install --target $PackageDir -r (Join-Path $PSScriptRoot 'requirements.txt')
& $Python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('$ModelName', cache_folder=r'$ModelDir', device='cpu')"
