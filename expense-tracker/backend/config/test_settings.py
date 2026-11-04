import os

os.environ["DEBUG"] = "True"
os.environ["DATABASE_URL"] = "sqlite:///:memory:"
os.environ["SECRET_KEY"] = "test-only-secret-key-for-local-test-signing"

from .settings import *  # noqa: F403
