"""Configuration de l'agent"""

import os
from dataclasses import dataclass, field
from pathlib import Path
from datetime import datetime
import uuid

# Charge le .env depuis le répertoire parent
from dotenv import load_dotenv
env_path = Path(__file__).parent.parent.parent / ".env"
load_dotenv(env_path)


def get_base_dir() -> Path:
    """Retourne le répertoire de base de l'agent"""
    return Path(__file__).parent.parent.parent


def get_workspace_dir() -> Path:
    """Retourne le répertoire workspace"""
    base = get_base_dir()
    workspace = base / "workspace"
    workspace.mkdir(exist_ok=True)
    return workspace


def create_session_dir() -> Path:
    """Crée un nouveau répertoire de session"""
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    session_id = str(uuid.uuid4())[:8]
    session_name = f"session_{timestamp}_{session_id}"

    session_dir = get_workspace_dir() / session_name
    session_dir.mkdir(exist_ok=True)
    return session_dir


@dataclass
class Config:
    # Ollama - Serveur principal
    OLLAMA_URL: str = "http://100.68.221.26:11434"

    # Modèles par type de tâche
    MODEL_FAST: str = "mistral:latest"           # 4GB - Rapide, planification
    MODEL_GENERAL: str = "qwen3:32b"             # 20GB - Chat général, raisonnement
    MODEL_CODE: str = "qwen3-coder:30b"          # 18GB - Génération de code
    MODEL_VISION: str = "qwen3-vl:32b"           # 21GB - Analyse d'images
    # On utilise le coder pour le raisonnement car devstral fait trop d'erreurs de syntaxe
    MODEL_REASONING: str = "qwen3-coder:30b"     # 18GB - Raisonnement complexe (Code)
    MODEL_WRITING: str = "qwen3:32b"             # 20GB - Rédaction (on garde qwen3 faute de VRAM pour llama3.3)

    # Alias pour compatibilité
    MODEL: str = "qwen3:32b"                     # Modèle par défaut
    MODEL_PLANNER: str = "mistral:latest"        # Pour la planification (rapide)

    # OpenRouter (backup)
    OPENROUTER_API_KEY: str = os.getenv("OPENROUTER_API_KEY", "")
    OPENROUTER_URL: str = "https://openrouter.ai/api/v1"

    # Recherche Web
    SERPER_API_KEY: str = os.getenv("SERPER_API_KEY", "")

    # Timeouts
    LLM_TIMEOUT: int = 300  # 5 minutes
    TERMINAL_TIMEOUT: int = 600  # 10 minutes
    WEB_TIMEOUT: int = 30

    # Agent
    MAX_RETRIES: int = 10
    MAX_RESEARCH_RESULTS: int = 5

    # Docker
    DOCKER_ENABLED: bool = True  # Utiliser Docker pour l'isolation
    DOCKER_IMAGE: str = "python:3.11-slim"
    DOCKER_MEMORY_LIMIT: str = "2g"
    DOCKER_CPU_LIMIT: float = 2.0
    DOCKER_TIMEOUT: int = 600

    # Paths
    BASE_DIR: Path = field(default_factory=get_base_dir)
    WORKSPACE_DIR: Path = field(default_factory=get_workspace_dir)


config = Config()
