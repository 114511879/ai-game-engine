param([string]$RagHome = 'E:\111\ai-game-engine-rag')
$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$Python = 'C:\Users\administered0\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe'
$PackageDir = Join-Path $RagHome 'python-packages'
$env:AGE_RAG_HOME = $RagHome
$env:HF_HOME = Join-Path $RagHome 'huggingface'
$env:SENTENCE_TRANSFORMERS_HOME = Join-Path $RagHome 'models'
$env:PYTHONPATH = "$PackageDir;$ProjectRoot"
& $Python -m uvicorn server.app:app --host 127.0.0.1 --port 8765
