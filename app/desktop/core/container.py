"""
Dependency injection container.

Provides singletons for core services used across the desktop host.
"""

# Standard library
from __future__ import annotations

# Project imports
from desktop.core.api import Api

# Singleton — import this instead of instantiating Api directly.
api: Api = Api()