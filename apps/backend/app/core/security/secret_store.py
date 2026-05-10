from __future__ import annotations

import logging
from functools import lru_cache
from typing import Any

from app.core.security.encryption import SecretsCipher, SecretsEncryptionError
from app.data.repos.secrets_repo import SecretsRepo
from app.settings import settings

LOGGER = logging.getLogger(__name__)

GITHUB_NAMESPACE = "github"
STATIC_ANALYSIS_GIT_TOKEN_KEY = "static_analysis_git_token"
GITHUB_APP_PRIVATE_KEY_PEM_KEY = "github_app_private_key_pem"


class EncryptedSecretStore:
    def __init__(self, *, repo: SecretsRepo | None = None, key: str | None = None) -> None:
        self._repo = repo or SecretsRepo()
        self._cipher: SecretsCipher | None = None
        self._cipher_error: str | None = None
        try:
            self._cipher = SecretsCipher(key if key is not None else settings.SECRETS_ENCRYPTION_KEY)
        except SecretsEncryptionError as exc:
            self._cipher_error = str(exc)

    @property
    def is_enabled(self) -> bool:
        return self._cipher is not None

    def upsert_secret(
        self,
        *,
        namespace: str,
        secret_key: str,
        plaintext: str,
        meta: dict[str, Any] | None = None,
    ) -> bool:
        if not plaintext:
            return False
        if self._cipher is None:
            LOGGER.warning("Encrypted secret store disabled: %s", self._cipher_error)
            return False

        ciphertext = self._cipher.encrypt(plaintext)
        self._repo.upsert(namespace=namespace, secret_key=secret_key, ciphertext=ciphertext, meta=meta)
        return True

    def get_secret(self, *, namespace: str, secret_key: str) -> str | None:
        record = self.get_secret_with_meta(namespace=namespace, secret_key=secret_key)
        if record is None:
            return None
        value, _meta = record
        return value

    def get_secret_with_meta(self, *, namespace: str, secret_key: str) -> tuple[str, dict[str, Any]] | None:
        if self._cipher is None:
            return None

        row = self._repo.get(namespace=namespace, secret_key=secret_key)
        if row is None:
            return None
        try:
            return self._cipher.decrypt(row.ciphertext), row.meta
        except SecretsEncryptionError:
            LOGGER.exception("Unable to decrypt stored secret for %s/%s", namespace, secret_key)
            return None

    def bootstrap_from_env(self) -> None:
        if not settings.SECRETS_BOOTSTRAP_FROM_ENV:
            return
        if self._cipher is None:
            return

        if settings.STATIC_ANALYSIS_GIT_TOKEN:
            self.upsert_secret(
                namespace=GITHUB_NAMESPACE,
                secret_key=STATIC_ANALYSIS_GIT_TOKEN_KEY,
                plaintext=settings.STATIC_ANALYSIS_GIT_TOKEN,
                meta={"source": "env", "env_var": "STATIC_ANALYSIS_GIT_TOKEN"},
            )

        if settings.GITHUB_APP_PRIVATE_KEY_PEM:
            self.upsert_secret(
                namespace=GITHUB_NAMESPACE,
                secret_key=GITHUB_APP_PRIVATE_KEY_PEM_KEY,
                plaintext=settings.GITHUB_APP_PRIVATE_KEY_PEM,
                meta={"source": "env", "env_var": "GITHUB_APP_PRIVATE_KEY_PEM"},
            )

    def resolve_static_analysis_git_token(self) -> str | None:
        stored = self.get_secret(namespace=GITHUB_NAMESPACE, secret_key=STATIC_ANALYSIS_GIT_TOKEN_KEY)
        if stored:
            return stored
        if settings.STATIC_ANALYSIS_GIT_TOKEN:
            self.upsert_secret(
                namespace=GITHUB_NAMESPACE,
                secret_key=STATIC_ANALYSIS_GIT_TOKEN_KEY,
                plaintext=settings.STATIC_ANALYSIS_GIT_TOKEN,
                meta={"source": "env", "env_var": "STATIC_ANALYSIS_GIT_TOKEN"},
            )
            return settings.STATIC_ANALYSIS_GIT_TOKEN
        return None

    def resolve_github_app_private_key(self) -> str | None:
        stored = self.get_secret(namespace=GITHUB_NAMESPACE, secret_key=GITHUB_APP_PRIVATE_KEY_PEM_KEY)
        if stored:
            return stored
        if settings.GITHUB_APP_PRIVATE_KEY_PEM:
            self.upsert_secret(
                namespace=GITHUB_NAMESPACE,
                secret_key=GITHUB_APP_PRIVATE_KEY_PEM_KEY,
                plaintext=settings.GITHUB_APP_PRIVATE_KEY_PEM,
                meta={"source": "env", "env_var": "GITHUB_APP_PRIVATE_KEY_PEM"},
            )
            return settings.GITHUB_APP_PRIVATE_KEY_PEM
        return None


@lru_cache(maxsize=1)
def get_secret_store() -> EncryptedSecretStore:
    return EncryptedSecretStore()
